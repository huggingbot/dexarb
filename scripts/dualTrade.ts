import { strict as assert } from 'assert'
import { BigNumber, CallOverrides, ContractTransaction, Overrides } from 'ethers'
import { ethers, network } from 'hardhat'
import { ENONCE_TOO_SMALL, ON_ERROR_SLEEP_MS } from '../constants'
import logger from '../core/logging'
import { Arb, ERC20 } from '../typechain-types'
import { Address } from '../types/common'
import { DualRoute, IBalance, IConfig, INetwork } from '../types/config'
import { getBaseAssetSymbol, getConfig, getRandomRoute, makeGoodRoute } from '../utils/config'
import { estimateTxGas, getContract, getEtherPrice, getSigner } from '../utils/ethers'
import { telegramBot } from './../core/telegramService'

const balances: Record<Address, IBalance> = {}
let config: IConfig

type TOverrides = Omit<Overrides, 'nonce'> & Pick<CallOverrides, 'from'> & { nonce: number }

const getGoodRoute = makeGoodRoute()

const onDualTradeError = async (
  error: unknown,
  arb: Arb,
  route: DualRoute,
  amount: BigNumber,
  overrides?: TOverrides
): Promise<boolean> => {
  const errorStr = JSON.stringify(error)
  if (errorStr.includes(ENONCE_TOO_SMALL)) {
    const signer = await getSigner(0)
    const nonce = (overrides?.nonce || (await ethers.provider.getTransactionCount(signer.address))) as number
    logger.info(`Error: ${ENONCE_TOO_SMALL}. Recalling dualTrade with nonce ${nonce + 1}`)
    await dualTrade(arb, route, amount, { nonce: nonce + 1 })
    return true
  }
  return false
}

const dualTrade = async (arb: Arb, route: DualRoute, amount: BigNumber, overrides?: TOverrides) => {
  try {
    const { router1, router2, token1, token2 } = route

    logger.info('> Making dualTrade...')
    const signer = await getSigner(0)

    let tx: ContractTransaction
    if (overrides) {
      tx = await arb.connect(signer).dualDexTrade(router1, router2, token1, token2, amount, overrides)
    } else {
      tx = await arb.connect(signer).dualDexTrade(router1, router2, token1, token2, amount)
    }
    await tx.wait()
    await new Promise((r) => setTimeout(r, 10000))

    await updateResults()
    logResults()
  } catch (e) {
    const isResolved = await onDualTradeError(e, arb, route, amount, overrides)
    if (!isResolved) throw e
  }
}

const calculateGasCost = async (arb: Arb, route: DualRoute, tradeSize: BigNumber): Promise<number> => {
  const { router1, router2, token1, token2 } = route
  const estimateTxCall = () => arb.estimateGas.dualDexTrade(router1, router2, token1, token2, tradeSize)
  const { estimatedGas, gasPriceInGwei, gasCostInEther } = await estimateTxGas(estimateTxCall)

  logger.info('Gas cost in ether', `${gasCostInEther} ether == ${estimatedGas} gas * ${gasPriceInGwei} gwei`)

  const etherPriceUsd = await getEtherPrice()
  const gasCostInUsd = Number(gasCostInEther) * etherPriceUsd

  logger.info(`Ether cost in USD: ${gasCostInUsd} USD == ${gasCostInEther} ether * ${etherPriceUsd} USD`)

  const isWeth = getBaseAssetSymbol(config, token1) === 'weth'
  // Use wrapped native token as gas cost if token1 is one, else denominate gas cost in USD assuming token1 is a stablecoin
  const gasCost = isWeth ? Number(gasCostInEther) : gasCostInUsd

  const assetToken = (await getContract('ERC20', token1)) as ERC20
  const decimals = await assetToken.decimals()

  return gasCost * 10 ** decimals
}

const lookForDualTrade = async (arb: Arb): Promise<void> | never => {
  try {
    const targetRoute: DualRoute = config.routes.length > 0 ? getGoodRoute(config) : getRandomRoute(config)
    const { router1, router2, token1, token2 } = targetRoute

    let tradeSize: BigNumber | undefined = balances[token1]?.balance
    if (typeof tradeSize === 'undefined') {
      const err = `Token ${token1} not found in ${Object.keys(balances)}`
      throw new Error(err)
    }
    if (tradeSize.toString() === '0') {
      const err = `Token ${token1} balance is 0`
      logger.warn(err)
      return
    }
    const amtBack = await arb.estimateDualDexTrade(router1, router2, token1, token2, tradeSize)
    const multiplier = BigNumber.from(config.minBasisPointsPerTrade + 10000)
    const profitTarget = tradeSize.mul(multiplier).div(BigNumber.from(10000))

    if (amtBack.gt(profitTarget)) {
      let msg = `['${router1}','${router2}','${token1}','${token2}']: amtBack ${amtBack}, profitTarget: ${profitTarget}`
      logger.info(msg)
      telegramBot.sendMessage(msg)
      const gasCost = await calculateGasCost(arb, targetRoute, tradeSize)
      // Assuming token is a stablecoin or wrapped native token for the addition to make sense
      const totalProfitTarget = profitTarget.add(gasCost)

      if (amtBack.gt(totalProfitTarget)) {
        let msg = `amtBack: ${amtBack}, totalProfitTarget: ${totalProfitTarget}`
        logger.info(msg)
        telegramBot.sendMessage(msg)
        await dualTrade(arb, targetRoute, tradeSize)
      }
    }
  } catch (e) {
    logger.error(e)
    await new Promise((r) => setTimeout(r, ON_ERROR_SLEEP_MS))
  }
}

const logResults = (): void => {
  logger.info(`############# LOGS #############`)

  for (let i = 0; i < config.baseAssets.length; i++) {
    const { symbol, address } = config.baseAssets[i]
    const startBalance = balances[address]?.startBalance
    const endBalance = balances[address]?.balance
    assert(typeof startBalance !== 'undefined', `'startBalance' is undefined using index of ${address} on ${balances}`)
    assert(typeof endBalance !== 'undefined', `'endBalance' is undefined using index of ${address} on ${balances}`)

    const diff = endBalance.sub(startBalance)
    const isZero = startBalance.toString() === '0'
    const basisPoints = isZero ? '0' : diff.mul(10000).div(startBalance).toString()
    logger.info(`# ${symbol}: startBalance=${startBalance}, endBalance=${endBalance}, bps=${basisPoints}`)
  }
}

// Mutate `balances`
const updateResults = async (): Promise<void> => {
  try {
    const initBalance = Object.keys(balances).length === 0

    for (let i = 0; i < config.baseAssets.length; i++) {
      const asset = config.baseAssets[i]
      const assetToken = (await getContract('ERC20', asset.address)) as ERC20
      const balance = await assetToken.balanceOf(config.arbContract)

      let msg = `Asset: ${asset.symbol} balance: ${balance}`
      logger.info(msg)
      telegramBot.sendMessage(msg)

      if (initBalance) {
        balances[asset.address] = { symbol: asset.symbol, balance, startBalance: balance }
      } else {
        balances[asset.address].balance = balance
      }
    }
  } catch (e) {
    throw e
  }
}

// Mutate `config`
const setup = async (): Promise<Arb> => {
  try {
    const signer = await getSigner(0)
    logger.info(`Signer: ${signer.address}`)

    const networkName = network.name as INetwork
    config = await getConfig(networkName)

    await updateResults()
    logResults()

    return (await getContract('Arb', config.arbContract)) as Arb
  } catch (e) {
    logger.error(e)
    throw e
  }
}

const main = async () => {
  telegramBot.sendMessage('Service started successfully')
  const arb = await setup()
  while (true) {
    await lookForDualTrade(arb)
  }
}

process.on('uncaughtException', function (err) {
  logger.error('UnCaught Exception 83: ' + err)
  logger.error(err.stack)
})

process.on('unhandledRejection', (reason, p) => {
  logger.error('Unhandled Rejection at: ' + p + ' - reason: ' + reason)
})

main().catch((error) => {
  logger.error(error)
  process.exitCode = 1
})
