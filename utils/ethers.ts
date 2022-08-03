import { ethers } from 'hardhat'
import { Contract, ContractFactory } from 'ethers'
import fs from 'fs'
import path from 'path'
import { BASE_DIR } from '../settings'
import { Address } from '../types/common'

export const getSigner = async <T extends number>(
  index: T
): Promise<Awaited<ReturnType<typeof ethers.getSigners>>[T]> => {
  const signers = await ethers.getSigners()
  return signers[index]
}

export const getContract = async <T extends Address | undefined = undefined>(
  contractName: string,
  address?: Address | T
): Promise<T extends Address ? Contract : ContractFactory> | never => {
  const contractNames = fs
    .readdirSync(path.join(BASE_DIR, 'contracts'))
    .map((file) => file.substring(0, file.lastIndexOf('.')) || file)

  if (!contractNames.includes(contractName)) {
    throw new Error(`Contract name '${contractName}' not found in ${contractNames}`)
  }
  const iContract = await ethers.getContractFactory(contractName)

  type TReturn = T extends Address ? Contract : ContractFactory
  return (typeof address !== 'undefined' ? iContract.attach(address) : iContract) as TReturn
}
