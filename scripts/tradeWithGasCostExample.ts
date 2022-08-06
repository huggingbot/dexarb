import { BigNumber } from 'ethers'
import { ethers } from 'hardhat'
import { etherscanApiKey } from '../hardhat.config'
import { Arb, ERC20 } from '../typechain-types'
import { getConfig, makeGoodRoute } from '../utils/config'
import { getContract } from '../utils/ethers'

const main = async () => {
  const [signer] = await ethers.getSigners()
  console.log(`Owner: ${signer.address}`)

  const config = await getConfig('aurora')

  const arb = (await getContract('Arb', config.arbContract)) as Arb

  const getGoodRoute = makeGoodRoute()
  const { router1, router2, token1, token2 } = getGoodRoute(config)

  console.log(`['${router1}','${router2}','${token1}','${token2}']`)

  // Assuming token is a stablecoin
  const assetToken = (await getContract('ERC20', token1)) as ERC20
  const decimals = await assetToken.decimals()
  const tradeSize = BigNumber.from(1).mul(BigNumber.from(10).pow(decimals))

  const amtBack = await arb.estimateDualDexTrade(router1, router2, token1, token2, tradeSize)
  const multiplier = BigNumber.from(config.minBasisPointsPerTrade + 10000)
  const profitTarget = tradeSize.mul(multiplier).div(BigNumber.from(10000))

  // const estimatedGas = await arb.estimateGas.dualDexTrade(router1, router2, token1, token2, tradeSize)
  const estimatedGas = await arb.estimateGas.estimateDualDexTrade(router1, router2, token1, token2, tradeSize)
  const { gasPrice } = await ethers.provider.getFeeData()
  const gasPriceInGwei = ethers.utils.formatUnits(gasPrice ?? 0, 'gwei')
  const gasCost = estimatedGas.mul(gasPrice ?? 0)
  const gasCostInEther = ethers.utils.formatUnits(gasCost ?? 0, 'ether')

  console.log('Gas cost in ether', `${gasCostInEther} ether == ${estimatedGas} gas * ${gasPriceInGwei} gwei`)

  const etherscanProvider = new ethers.providers.EtherscanProvider('homestead', etherscanApiKey)
  const etherPriceUsd = await etherscanProvider.getEtherPrice()
  const etherCostInUsd = Number(gasCostInEther) * etherPriceUsd

  console.log(`Ether cost in USD: ${etherCostInUsd} USD == ${gasCostInEther} ether * ${etherPriceUsd} USD`)

  if (amtBack.gt(profitTarget.add(etherCostInUsd * 10 ** decimals))) {
    const tx = await arb.connect(signer).dualDexTrade(router1, router2, token1, token2, tradeSize)
    await tx.wait()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
