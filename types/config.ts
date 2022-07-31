import { BigNumber } from 'ethers'
import { NetworkUserConfig } from 'hardhat/types'
import { Address } from './common'

export type INetwork = 'aurora' | 'fantom'

export type INetworkConfig = {
  [key in INetwork]: NetworkUserConfig
}

export type IApiKeyConfig = {
  [key in INetwork]?: string
}

export interface IConfig {
  arbContract: Address
  minBasisPointsPerTrade: number
  routers: {
    dex: string
    address: Address
  }[]
  baseAssets: {
    symbol: string
    address: Address
  }[]
  tokens: {
    symbol: string
    address: Address
  }[]
  routes: Address[][]
}

export interface IBalance {
  symbol: string
  balance: BigNumber
  startBalance: BigNumber
}

export interface DualRoute {
  router1: Address
  router2: Address
  token1: Address
  token2: Address
}
