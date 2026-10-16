const fs = require("fs")
const path = require("path")
const solc = require("solc")

function compileContract() {
  const source = fs.readFileSync(path.join(__dirname, "../contracts/IntegrityCommitments.sol"), "utf8")
  const input = {
    language: "Solidity",
    sources: { "IntegrityCommitments.sol": { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  }
  const output = JSON.parse(solc.compile(JSON.stringify(input)))
  const errors = (output.errors || []).filter((entry) => entry.severity === "error")
  if (errors.length) throw new Error(errors.map((entry) => entry.formattedMessage).join("\n"))

  const contract = output.contracts?.["IntegrityCommitments.sol"]?.IntegrityCommitments
  if (!contract?.evm?.bytecode?.object) throw new Error("Solidity compiler produced no contract bytecode")
  return { abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}`, compilerVersion: solc.version() }
}

module.exports = { compileContract }
