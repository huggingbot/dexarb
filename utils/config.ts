import { network } from 'hardhat'
import logger from '../core/logging'
import { auroraMainnetArbContract, ftmMainnetArbContract } from '../hardhat.config'
import { DualRoute, IConfig, INetwork } from '../types/config'

export const getConfig = async (networkName: INetwork): Promise<IConfig> | never => {
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

export const getRandomRoute = (config: IConfig): DualRoute => {
  const router1 = config.routers[Math.floor(Math.random() * config.routers.length)].address
  const router2 = config.routers[Math.floor(Math.random() * config.routers.length)].address
  const token1 = config.baseAssets[Math.floor(Math.random() * config.baseAssets.length)].address
  const token2 = config.tokens[Math.floor(Math.random() * config.tokens.length)].address
  return { router1, router2, token1, token2 }
}

export const makeGoodRoute = (): ((config: IConfig) => DualRoute) => {
  let goodCount = 0

  return (config: IConfig) => {
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
  }
}
