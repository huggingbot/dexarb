import { BigNumber } from 'ethers'
import { ethers, network } from 'hardhat'
import { ON_ERROR_SLEEP_MS } from '../constants'
import logger from '../core/logging'
import { auroraMainnetArbContract, ftmMainnetArbContract } from '../hardhat.config'
import { Arb } from '../typechain-types'
import { Address } from '../types/common'
import { DualRoute, IBalance, IConfig, INetwork } from '../types/config'
import { getSigner } from '../utils/ethers'

const balances: Record<Address, IBalance> = {}
let config: IConfig

const dualTrade = async (arb: Arb, route: DualRoute, amount: BigNumber) => {
  const { router1, router2, token1, token2 } = route
  try {
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

const searchForRoutes = (): DualRoute => {
  const router1 = config.routers[Math.floor(Math.random() * config.routers.length)].address
  const router2 = config.routers[Math.floor(Math.random() * config.routers.length)].address
  const token1 = config.baseAssets[Math.floor(Math.random() * config.baseAssets.length)].address
  const token2 = config.tokens[Math.floor(Math.random() * config.tokens.length)].address
  return { router1, router2, token1, token2 }
}

const useGoodRoutes = (): DualRoute => {
  let goodCount = 0

  return (() => {
    const route = config.routes[goodCount]
    goodCount++

    if (goodCount >= config.routes.length) {
      goodCount = 0
    }
    const router1 = route[0]
    const router2 = route[1]
    const token1 = route[2]
    const token2 = route[3]
    return { router1, router2, token1, token2 }
  })()
}

const lookForDualTrade = async (arb: Arb): Promise<void> | never => {
  const targetRoute: DualRoute = config.routes.length > 0 ? useGoodRoutes() : searchForRoutes()
  const { router1, router2, token1, token2 } = targetRoute

  try {
    let tradeSize: BigNumber | undefined = balances[token1]?.balance
    if (!tradeSize) {
      const err = `Token ${token1} not found in ${Object.keys(balances)}`
      logger.error(err)
      throw new Error(err)
    }

    logger.info(`['${router1}','${router2}','${token1}','${token2}']`)

    const amtBack = await arb.estimateDualDexTrade(router1, router2, token1, token2, tradeSize)
    const multiplier = BigNumber.from(config.minBasisPointsPerTrade + 10000)
    const profitTarget = tradeSize.mul(multiplier).div(BigNumber.from(10000))

    if (amtBack.gt(profitTarget)) {
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
    const startBalance = balances[address].startBalance
    const endBalance = balances[address].balance
    const diff = endBalance.sub(startBalance)

    const isZero = startBalance.toNumber() === 0
    const basisPoints = isZero ? '0' : diff.mul(10000).div(startBalance).toString()
    logger.info(`# ${symbol}: startBalance=${startBalance}, endBalance=${endBalance}, bps=${basisPoints}`)
  }
}

// Mutate `balances`
const updateResults = async (): Promise<void> => {
  const initBalance = Object.keys(balances).length === 0

  for (let i = 0; i < config.baseAssets.length; i++) {
    const asset = config.baseAssets[i]
    const iERC20 = await ethers.getContractFactory('ERC20')
    const assetToken = iERC20.attach(asset.address)
    const balance = await assetToken.balanceOf(config.arbContract)

    if (initBalance) {
      balances[asset.address] = { symbol: asset.symbol, balance, startBalance: balance }
    } else {
      balances[asset.address].balance = balance
    }
  }
}

const getConfig = async (networkName: INetwork): Promise<IConfig> | never => {
  let partial: Omit<IConfig, 'arbContract'>
  let configs: IConfig

  switch (networkName) {
    case 'aurora':
      partial = (await import('../config/aurora.json')).default
      configs = { ...partial, arbContract: auroraMainnetArbContract }
      break
    case 'fantom':
      partial = (await import('../config/fantom.json')).default
      configs = { ...partial, arbContract: ftmMainnetArbContract }
      break
    default:
      const err = `No matching config file for network '${network.name}'`
      logger.error(err)
      throw new Error(err)
  }
  logger.info(`Loaded ${configs.routes.length} routes`)
  return configs
}

// Mutate `config`
const setup = async (): Promise<Arb> => {
  const signer = await getSigner(0)
  logger.info(`Signer: ${signer.address}`)

  const networkName = network.name as INetwork
  config = await getConfig(networkName)

  await updateResults()
  logResults()

  const iArb = await ethers.getContractFactory('Arb')
  return iArb.attach(config.arbContract) as Arb
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
