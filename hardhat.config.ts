import '@nomicfoundation/hardhat-toolbox'
import * as dotenv from 'dotenv'
import { HardhatUserConfig } from 'hardhat/config'
import { INetworkConfig } from './types/config'

dotenv.config()

const auroraMainnetUrl = process.env.AURORA_MAINNET_URL
const auroraMainnetPrivateKey = process.env.AURORA_MAINNET_PRIVATE_KEY
export const auroraMainnetArbContract = process.env.AURORA_MAINNET_ARB_CONTRACT ?? ''

const ftmMainnetUrl = process.env.FTM_MAINNET_URL
const ftmMainnetPrivateKey = process.env.FTM_MAINNET_PRIVATE_KEY
export const ftmMainnetArbContract = process.env.FTM_MAINNET_ARB_CONTRACT ?? ''

const networks: INetworkConfig = {
  aurora: {
    url: auroraMainnetUrl,
    accounts: auroraMainnetPrivateKey ? [auroraMainnetPrivateKey] : [],
  },
  fantom: {
    url: ftmMainnetUrl,
    accounts: ftmMainnetPrivateKey ? [ftmMainnetPrivateKey] : [],
  },
}

const config: HardhatUserConfig = {
  networks: networks as unknown as HardhatUserConfig['networks'],
  solidity: '0.8.9',
}

export default config
