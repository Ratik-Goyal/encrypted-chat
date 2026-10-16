require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") })
const { deployContract } = require("./deploy-contract")

deployContract({
  rpcUrl: process.env.BLOCKCHAIN_RPC || "http://127.0.0.1:8545",
  privateKey: process.env.BLOCKCHAIN_PRIVATE_KEY,
  expectedChainId: Number(process.env.BLOCKCHAIN_CHAIN_ID || 1337),
  networkName: "local",
}).catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
