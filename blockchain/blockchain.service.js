const fs = require("fs")
const path = require("path")
const { ethers } = require(require.resolve("ethers", { paths: [path.join(__dirname, "../backend"), __dirname] }))

const ABI = [
  "function owner() view returns (address)",
  "function totalBatches() view returns (uint256)",
  "function batches(uint256) view returns (bytes32 merkleRoot, uint32 leafCount, uint64 committedAt)",
  "function commitBatch(bytes32 merkleRoot, uint32 leafCount) returns (uint256 batchId)",
  "event BatchCommitted(uint256 indexed batchId, bytes32 indexed merkleRoot, uint32 leafCount, uint64 committedAt)",
]

class BlockchainService {
  constructor() {
    this.provider = null
    this.contract = null
    this.providerUrl = null
    this.contractAddress = null
    this.chainId = null
  }

  async initialize(providerUrl, contractAddress, expectedChainId = null) {
    const deploymentPath = path.join(__dirname, "deployment.json")
    const deployedAddress = contractAddress || (
      fs.existsSync(deploymentPath) && JSON.parse(fs.readFileSync(deploymentPath, "utf8")).contractAddress
    )
    if (!providerUrl || !deployedAddress || !ethers.isAddress(deployedAddress)) {
      throw new Error("A blockchain RPC URL and deployed commitment contract are required")
    }
    if (this.provider && this.contract && this.providerUrl === providerUrl && this.contractAddress === deployedAddress) {
      if (expectedChainId && this.chainId !== expectedChainId) throw new Error("Blockchain RPC chain ID does not match configuration")
      return true
    }

    const provider = new ethers.JsonRpcProvider(providerUrl)
    const network = await provider.getNetwork()
    if (expectedChainId && Number(network.chainId) !== expectedChainId) {
      throw new Error("Blockchain RPC chain ID does not match configuration")
    }
    const code = await provider.getCode(deployedAddress)
    if (code === "0x") throw new Error("No contract is deployed at the configured address")

    this.provider = provider
    this.contract = new ethers.Contract(deployedAddress, ABI, provider)
    this.providerUrl = providerUrl
    this.contractAddress = deployedAddress
    this.chainId = Number(network.chainId)
    return true
  }

  async commitBatch(merkleRoot, leafCount, privateKey, confirmations = 1) {
    if (!this.contract || !this.provider) throw new Error("Blockchain service is not initialized")
    if (!ethers.isHexString(merkleRoot, 32) || !Number.isInteger(leafCount) || leafCount < 1 || leafCount > 0xffffffff) {
      throw new Error("Invalid batch commitment")
    }
    if (!privateKey) throw new Error("A commitment signer is required")

    const wallet = new ethers.Wallet(privateKey, this.provider)
    if ((await this.contract.owner()).toLowerCase() !== wallet.address.toLowerCase()) {
      throw new Error("Commitment signer is not the contract owner")
    }
    const previousEvents = await this.contract.queryFilter(this.contract.filters.BatchCommitted(null, merkleRoot), 0, "latest")
    const existing = previousEvents[previousEvents.length - 1]
    if (existing) {
      const batchId = Number(existing.args.batchId)
      const batch = await this.getBatch(batchId)
      if (batch.leafCount !== leafCount) throw new Error("The existing on-chain root has a different leaf count")
      const receipt = await this.provider.waitForTransaction(existing.transactionHash, confirmations)
      if (!receipt || receipt.status !== 1) throw new Error("The existing batch transaction is not confirmed")
      return { batchId, transactionHash: receipt.hash, blockNumber: receipt.blockNumber }
    }

    const transaction = await this.contract.connect(wallet).commitBatch(merkleRoot, leafCount)
    const receipt = await transaction.wait(confirmations)
    const committed = receipt.logs
      .map((log) => { try { return this.contract.interface.parseLog(log) } catch { return null } })
      .find((event) => event?.name === "BatchCommitted" && event.args.merkleRoot.toLowerCase() === merkleRoot.toLowerCase())
    if (!committed) throw new Error("The blockchain did not emit the expected batch commitment")
    return {
      batchId: Number(committed.args.batchId),
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    }
  }

  async getBatch(batchId) {
    if (!this.contract) throw new Error("Blockchain service is not initialized")
    const batch = await this.contract.batches(batchId)
    return {
      merkleRoot: batch.merkleRoot,
      leafCount: Number(batch.leafCount),
      committedAt: Number(batch.committedAt),
    }
  }

  async getTotalBatches() {
    if (!this.contract) throw new Error("Blockchain service is not initialized")
    return Number(await this.contract.totalBatches())
  }

  async getBlockchainInfo() {
    if (!this.provider || !this.contract) throw new Error("Blockchain service is not initialized")
    const network = await this.provider.getNetwork()
    return {
      chainId: Number(network.chainId),
      blockNumber: await this.provider.getBlockNumber(),
      contractAddress: await this.contract.getAddress(),
    }
  }
}

module.exports = new BlockchainService()
