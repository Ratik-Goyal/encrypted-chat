require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") })
const { deployContract } = require("./deploy-contract")

deployContract({
  rpcUrl: process.env.SEPOLIA_RPC_URL,
  privateKey: process.env.SEPOLIA_PRIVATE_KEY,
  expectedChainId: 11155111,
  networkName: "sepolia",
}).catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})


