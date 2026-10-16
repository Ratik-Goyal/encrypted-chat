require("dotenv").config()

const isProduction = () => process.env.NODE_ENV === "production"
const isDevelopment = () => process.env.NODE_ENV === "development"

module.exports = {
  contractAddress: process.env.CONTRACT_ADDRESS || "",
  blockchainRpc: process.env.BLOCKCHAIN_RPC || "http://localhost:8545",
  privateKey: process.env.BLOCKCHAIN_PRIVATE_KEY || "",
  networkId: process.env.NETWORK_ID || "1337",
  gasLimit: process.env.GAS_LIMIT || "3000000",
  isProduction,
  isDevelopment,
}
