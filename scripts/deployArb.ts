import { ethers } from 'hardhat'

const main = async () => {
  const [signer] = await ethers.getSigners()
  console.log(`Owner: ${signer.address}`)

  const contractName = 'Arb'
  const iContract = await ethers.getContractFactory(contractName)
  const contract = await iContract.deploy()
  await contract.deployed()

  console.log(`${contractName} deployed to: ${contract.address}`)
  console.log('Put the above contract address into the .env file under <network_name>_ARB_CONTRACT')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
