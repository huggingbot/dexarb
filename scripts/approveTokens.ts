import { ethers, network } from 'hardhat'
import { ERC20 } from '../typechain-types'
import { INetwork } from '../types/config'
import { getConfig } from '../utils/config'
import { getContract, getSigner } from '../utils/ethers'

const main = async () => {
  const signer = await getSigner(0)
  console.log(`Signer: ${signer.address}`)

  const networkName = network.name as INetwork
  const config = await getConfig(networkName)

  const approvedTokens = new Set<string>()

  for (let i = 0; i < config.routes.length; i++) {
    const [router1, router2, token1, token2] = config.routes[i]
    const approvePair = [
      [router1, token1],
      [router2, token2],
    ]

    for (let j = 0; j < approvePair.length; j++) {
      const [router, token] = approvePair[j]
      const assetToken = (await getContract('ERC20', token)) as ERC20

      if (approvedTokens.has(`${token}-${router}`)) continue

      const allowance = await assetToken.allowance(signer.address, router)
      console.log(`Allowance for token ${token} for router ${router} is ${allowance}`)

      if (allowance.toString() === '0') {
        const tx = await assetToken.approve(router, ethers.constants.MaxUint256)
        await tx.wait()

        const allowance = await assetToken.allowance(signer.address, router)
        console.log(`New allowance for token ${token} for router ${router} is ${allowance}`)
      }
      approvedTokens.add(`${token}-${router}`)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
