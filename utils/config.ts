import { strict as assert } from 'assert'
import { network } from 'hardhat'
import logger from '../core/logging'
import { auroraMainnetArbContract, ftmMainnetArbContract } from '../hardhat.config'
import { Address } from '../types/common'
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
  const router1 = config.routers[Math.floor(Math.random() * config.routers.length)]?.address
  const router2 = config.routers[Math.floor(Math.random() * config.routers.length)]?.address
  const token1 = config.baseAssets[Math.floor(Math.random() * config.baseAssets.length)]?.address
  const token2 = config.tokens[Math.floor(Math.random() * config.tokens.length)]?.address

  const dualRoute = { router1, router2, token1, token2 }
  assertDualRoute(dualRoute)
  return dualRoute
}

export const makeGoodRoute = (): ((config: IConfig) => DualRoute) => {
  let goodCount = 0

  return (config: IConfig) => {
    const route = config.routes[goodCount]
    assert(typeof route !== 'undefined', `'route' is undefined using index of ${goodCount}`)
    goodCount++

    if (goodCount >= config.routes.length) {
      goodCount = 0
    }
    const router1 = route[0]
    const router2 = route[1]
    const token1 = route[2]
    const token2 = route[3]

    const dualRoute = { router1, router2, token1, token2 }
    assertDualRoute(dualRoute)
    return dualRoute
  }
}

const assertDualRoute = (route: DualRoute): void => {
  const { router1, router2, token1, token2 } = route
  assert(typeof router1 !== 'undefined', `'router1' is undefined using index of 0 on ${route}`)
  assert(typeof router2 !== 'undefined', `router2 is undefined using index of 1 on ${route}`)
  assert(typeof token1 !== 'undefined', `'token1' is undefined using index of 2 on ${route}`)
  assert(typeof token2 !== 'undefined', `'token2' is undefined using index of 3 on ${route}`)
}

export const getBaseAssetSymbol = (config: IConfig, token: Address) => {
  const baseAsset = config.baseAssets.find(({ address }) => address.toLowerCase() === token.toLowerCase())
  return baseAsset?.symbol.toLowerCase()
}
