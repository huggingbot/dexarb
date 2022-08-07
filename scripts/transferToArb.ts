import { network } from 'hardhat'
import { Arb, ERC20 } from '../typechain-types'
import { INetwork } from '../types/config'
import { getConfig } from '../utils/config'
import { getContract, getSigner } from '../utils/ethers'

const main = async () => {
  const signer = await getSigner(0)
  console.log(`Signer: ${signer.address}`)

  const networkName = network.name as INetwork
  const config = await getConfig(networkName)

  const arb = (await getContract('Arb', config.arbContract)) as Arb

  for (let i = 0; i < config.baseAssets.length; i++) {
    const { symbol, address } = config.baseAssets[i]
    const assetToken = (await getContract('ERC20', address)) as ERC20

    const signerBalance = await assetToken.balanceOf(signer.address)
    console.log(`${symbol} Signer Balance: ${signerBalance.toString()}`)

    if (signerBalance.toString() === '0') {
      console.log(`Skipping ${symbol} as signer balance is 0`)
      continue
    }

    const arbBalance = await arb.getBalance(address)
    console.log(`${symbol} Original Arb Balance: ${arbBalance.toString()}`)

    const tx = await assetToken.transfer(config.arbContract, signerBalance)
    await tx.wait()
    await new Promise((r) => setTimeout(r, 10000))

    const newArbBalance = await arb.getBalance(address)
    console.log(`${symbol} New Arb Balance: ${newArbBalance.toString()}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
