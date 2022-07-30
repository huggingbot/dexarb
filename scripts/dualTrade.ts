import { BigNumber } from 'ethers'
import fs from 'fs'
import { ethers, network } from 'hardhat'
import { LOG_RESULTS_INTERVAL_MS } from '../constants'
import logger from '../core/logging'
import { auroraMainnetArbContract, ftmMainnetArbContract } from '../hardhat.config'
import { Arb } from '../typechain-types'
import { Address } from '../types/common'
import { DualRoute, IBalance, IConfig, INetwork } from '../types/config'

const config: IConfig = await (async (): Promise<IConfig> | never => {
  const networkName = network.name as INetwork
  let partial: Omit<IConfig, 'arbContract'>
  let config: IConfig

  switch (networkName) {
    case 'aurora':
      partial = (await import('../config/aurora.json')).default
      config = { ...partial, arbContract: auroraMainnetArbContract }
      break
    case 'fantom':
      partial = (await import('../config/fantom.json')).default
      config = { ...partial, arbContract: ftmMainnetArbContract }
      break
    default:
      const err = `No matching config file for network '${network.name}'`
      logger.error(err)
      throw new Error(err)
  }
  logger.info(`Loaded ${config.routes.length} routes`)
  return config
})()

const balances: Record<Address, IBalance> = {}

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

const dualTrade = async (arb: Arb, route: DualRoute, amount: BigNumber) => {
  const { router1, router2, token1, token2 } = route
  try {
    logger.info('> Making dualTrade...')
    const signer = await getSigner(0)
    const tx = await arb.connect(signer).dualDexTrade(router1, router2, token1, token2, amount)
    await tx.wait()
  } catch (e) {
    logger.error(e)
  }
}

const lookForDualTrade = async (arb: Arb): Promise<void> => {
  const targetRoute: DualRoute = config.routes.length > 0 ? useGoodRoutes() : searchForRoutes()
  const { router1, router2, token1, token2 } = targetRoute

  try {
    let tradeSize: BigNumber | undefined = balances[token1]?.balance
    if (!tradeSize) {
      logger.error(`Token ${token1} not found in ${Object.keys(balances)}`)
      return
    }

    logger.info(`["${router1}","${router2}","${token1}","${token2}"]`)

    const amtBack = await arb.estimateDualDexTrade(router1, router2, token1, token2, tradeSize)
    const multiplier = BigNumber.from(config.minBasisPointsPerTrade + 10000)
    const profitTarget = tradeSize.mul(multiplier).div(BigNumber.from(10000))

    if (amtBack.gt(profitTarget)) {
      await dualTrade(arb, targetRoute, tradeSize)
    }
  } catch (e) {
    logger.error(e)
  }
}

const updateAndLogResults = async (): Promise<void> => {
  logger.info(`############# LOGS #############`)
  for (let i = 0; i < config.baseAssets.length; i++) {
    const asset = config.baseAssets[i]
    const iERC20 = await ethers.getContractFactory('ERC20')
    const assetToken = iERC20.attach(asset.address)
    const balance = await assetToken.balanceOf(config.arbContract)

    if (Object.keys(balances).length === 0) {
      balances[asset.address] = { symbol: asset.symbol, balance, startBalance: balance }
      logger.info(asset.symbol, balance.toString())
    } else {
      balances[asset.address].balance = balance
      const diff = balances[asset.address].balance.sub(balances[asset.address].startBalance)
      const basisPoints = diff.mul(10000).div(balances[asset.address].startBalance)
      logger.info(`#  ${asset.symbol}: ${basisPoints.toString()}bps`)
    }
  }
}

const getSigner = async <T extends number>(index: T): Promise<Awaited<ReturnType<typeof ethers.getSigners>>[T]> => {
  const signers = await ethers.getSigners()
  return signers[index]
}

const setup = async (): Promise<Arb> => {
  const signer = await getSigner(0)
  logger.info(`Signer: ${signer.address}`)

  updateAndLogResults()

  setInterval(() => {
    updateAndLogResults()
  }, LOG_RESULTS_INTERVAL_MS)

  const iArb = await ethers.getContractFactory('Arb')
  return iArb.attach(config.arbContract)
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
  fs.appendFile('./critical.txt', err?.stack ?? '', function () {})
})

process.on('unhandledRejection', (reason, p) => {
  logger.error('Unhandled Rejection at: ' + p + ' - reason: ' + reason)
})

main().catch((error) => {
  logger.error(error)
  process.exitCode = 1
})
