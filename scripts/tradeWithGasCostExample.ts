import { BigNumber } from 'ethers'
import { ethers, network } from 'hardhat'
import { Arb, ERC20 } from '../typechain-types'
import { INetwork } from '../types/config'
import { getBaseAssetSymbol, getConfig, makeGoodRoute } from '../utils/config'
import { estimateTxGas, getContract, getEtherPrice } from '../utils/ethers'

const main = async () => {
  try {
    const [signer] = await ethers.getSigners()
    console.log(`Owner: ${signer.address}`)

    const networkName = network.name as INetwork
    const config = await getConfig(networkName)

    const arb = (await getContract('Arb', config.arbContract)) as Arb

    const getGoodRoute = makeGoodRoute()
    const { router1, router2, token1, token2 } = getGoodRoute(config)

    console.log(`['${router1}','${router2}','${token1}','${token2}']`)

    // Assuming token is a stablecoin or WETH
    const assetToken = (await getContract('ERC20', token1)) as ERC20
    const decimals = await assetToken.decimals()
    const tradeSize = BigNumber.from(100).mul(BigNumber.from(10).pow(decimals))

    const amtBack = await arb.estimateDualDexTrade(router1, router2, token1, token2, tradeSize)
    const multiplier = BigNumber.from(config.minBasisPointsPerTrade + 10000)
    const profitTarget = tradeSize.mul(multiplier).div(BigNumber.from(10000))

    // const estimateTxCall = () => arb.estimateGas.estimateDualDexTrade(router1, router2, token1, token2, tradeSize)
    const estimateTxCall = () => arb.estimateGas.dualDexTrade(router1, router2, token1, token2, tradeSize)
    const { estimatedGas, gasPriceInGwei, gasCostInEther } = await estimateTxGas(estimateTxCall)

    console.log('Gas cost in ether', `${gasCostInEther} ether == ${estimatedGas} gas * ${gasPriceInGwei} gwei`)

    const etherPriceUsd = await getEtherPrice()
    const etherCostInUsd = Number(gasCostInEther) * etherPriceUsd

    console.log(`Ether cost in USD: ${etherCostInUsd} USD == ${gasCostInEther} ether * ${etherPriceUsd} USD`)

    const isWeth = getBaseAssetSymbol(config, token1) === 'weth'
    const costToAdd = isWeth ? Number(gasCostInEther) : etherCostInUsd

    if (amtBack.gt(profitTarget.add(costToAdd * 10 ** decimals))) {
      const tx = await arb.connect(signer).dualDexTrade(router1, router2, token1, token2, tradeSize)
      await tx.wait()
    }
  } catch (e) {
    console.error(e)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
