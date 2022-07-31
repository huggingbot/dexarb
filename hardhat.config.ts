import '@nomicfoundation/hardhat-toolbox'
import * as dotenv from 'dotenv'
import { HardhatUserConfig } from 'hardhat/config'
import { IApiKeyConfig, INetworkConfig } from './types/config'

dotenv.config()

const auroraMainnetUrl = process.env.AURORA_MAINNET_URL
const auroraMainnetPrivateKey = process.env.AURORA_MAINNET_PRIVATE_KEY
export const auroraMainnetArbContract = process.env.AURORA_MAINNET_ARB_CONTRACT ?? ''
const aurorascanApiKey = process.env.AURORASCAN_API_KEY ?? ''

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

const apiKey: IApiKeyConfig = {
  aurora: aurorascanApiKey,
}

const config: HardhatUserConfig = {
  networks: networks as unknown as HardhatUserConfig['networks'],
  etherscan: {
    apiKey,
  },
  solidity: {
    version: '0.8.9',
    settings: {
      optimizer: {
        enabled: true,
        runs: 888,
      },
    },
  },
}

export default config
