import { ethers } from 'hardhat'

export const getSigner = async <T extends number>(
  index: T
): Promise<Awaited<ReturnType<typeof ethers.getSigners>>[T]> => {
  const signers = await ethers.getSigners()
  return signers[index]
}
