const fs = require("fs")
const path = require("path")
const { ethers } = require("ethers")
const { compileContract } = require("./compile-contract")

async function deployContract({ rpcUrl, privateKey, expectedChainId, networkName }) {
  if (!rpcUrl || !privateKey) throw new Error("Set the network RPC URL and a dedicated signer key in the environment")
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const network = await provider.getNetwork()
  if (Number(network.chainId) !== expectedChainId) {
    throw new Error(`RPC chain ID ${network.chainId} does not match expected chain ID ${expectedChainId}`)
  }

  const wallet = new ethers.Wallet(privateKey, provider)
  const balance = await provider.getBalance(wallet.address)
  if (balance === 0n) throw new Error("The deployer account has no native token for gas")

  const artifact = compileContract()
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet)
  const contract = await factory.deploy()
  const receipt = await contract.deploymentTransaction().wait(1)
  if (!receipt || receipt.status !== 1) throw new Error("Contract deployment was not confirmed")

  const deployment = {
    contractName: "IntegrityCommitments",
    contractAddress: await contract.getAddress(),
    network: networkName,
    chainId: expectedChainId,
    rpcUrl,
    deployerAddress: wallet.address,
    deployedAt: new Date().toISOString(),
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    compilerVersion: artifact.compilerVersion,
  }
  const deploymentPath = path.join(__dirname, "../deployment.json")
  fs.writeFileSync(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`, { mode: 0o600 })

  console.log(`IntegrityCommitments deployed to ${deployment.contractAddress}`)
  console.log(`Chain ${expectedChainId}; transaction ${receipt.hash}`)
  console.log(`Set BLOCKCHAIN_RPC=${rpcUrl}`)
  console.log(`Set BLOCKCHAIN_CHAIN_ID=${expectedChainId}`)
  console.log(`Set BLOCKCHAIN_CONTRACT_ADDRESS=${deployment.contractAddress}`)
  console.log("Store the owner key only in the backend secret manager.")
}

module.exports = { deployContract }
