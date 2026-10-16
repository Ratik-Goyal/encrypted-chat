const { compileContract } = require("./compile-contract")

try {
  const contract = compileContract()
  console.log(`IntegrityCommitments compiled with solc ${contract.compilerVersion}`)
  console.log(`Creation bytecode: ${(contract.bytecode.length - 2) / 2} bytes`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
