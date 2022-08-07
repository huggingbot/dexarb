import { strict as assert } from 'assert'
import { BigNumber } from 'ethers'
import { network } from 'hardhat'
import { ON_ERROR_SLEEP_MS } from '../constants'
import logger from '../core/logging'
import { Arb, ERC20 } from '../typechain-types'
import { Address } from '../types/common'
import { DualRoute, IBalance, IConfig, INetwork } from '../types/config'
import { getBaseAssetSymbol, getConfig, getRandomRoute, makeGoodRoute } from '../utils/config'
import { estimateTxGas, getContract, getEtherPrice, getSigner } from '../utils/ethers'

const balances: Record<Address, IBalance> = {}
let config: IConfig

const getGoodRoute = makeGoodRoute()

const dualTrade = async (arb: Arb, route: DualRoute, amount: BigNumber) => {
  try {
    const { router1, router2, token1, token2 } = route

    logger.info('> Making dualTrade...')
    const signer = await getSigner(0)
    const tx = await arb.connect(signer).dualDexTrade(router1, router2, token1, token2, amount)
    await tx.wait()

    await updateResults()
    logResults()
  } catch (e) {
    throw e
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
      throw new Error(err)
    }
    logger.info(`['${router1}','${router2}','${token1}','${token2}']`)

    const amtBack = await arb.estimateDualDexTrade(router1, router2, token1, token2, tradeSize)
    const multiplier = BigNumber.from(config.minBasisPointsPerTrade + 10000)
    const profitTarget = tradeSize.mul(multiplier).div(BigNumber.from(10000))

    const gasCost = await calculateGasCost(arb, targetRoute, tradeSize)
    // Assuming token is a stablecoin or wrapped native token for the addition to make sense
    const totalProfitTarget = profitTarget.add(gasCost)

    if (amtBack.gt(totalProfitTarget)) {
      await dualTrade(arb, targetRoute, tradeSize)
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
