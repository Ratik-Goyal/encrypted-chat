const crypto = require("crypto")

function bytes32(value) {
  if (typeof value !== "string" || !/^0x[0-9a-f]{64}$/i.test(value)) {
    throw new Error("Expected a 32-byte hexadecimal value")
  }
  return Buffer.from(value.slice(2), "hex")
}

function hash(data) {
  return crypto.createHash("sha256").update(data).digest()
}

function leafHash(commitment) {
  return hash(Buffer.concat([Buffer.from([0]), bytes32(commitment)]))
}

function parentHash(left, right) {
  const [first, second] = Buffer.compare(left, right) <= 0 ? [left, right] : [right, left]
  return hash(Buffer.concat([Buffer.from([1]), first, second]))
}

function buildMerkleTree(commitments) {
  if (!Array.isArray(commitments) || commitments.length === 0) throw new Error("A Merkle batch cannot be empty")
  if (commitments.length > 0xffffffff) throw new Error("A Merkle batch is too large")

  const levels = [commitments.map(leafHash)]
  while (levels[levels.length - 1].length > 1) {
    const current = levels[levels.length - 1]
    const next = []
    for (let index = 0; index < current.length; index += 2) {
      next.push(parentHash(current[index], current[index + 1] || current[index]))
    }
    levels.push(next)
  }

  return {
    root: `0x${levels[levels.length - 1][0].toString("hex")}`,
    proofFor(index) {
      if (!Number.isInteger(index) || index < 0 || index >= commitments.length) throw new Error("Invalid Merkle leaf index")
      const siblings = []
      let position = index
      for (let level = 0; level < levels.length - 1; level += 1) {
        const nodes = levels[level]
        const sibling = nodes[position ^ 1] || nodes[position]
        siblings.push(`0x${sibling.toString("hex")}`)
        position = Math.floor(position / 2)
      }
      return siblings
    },
  }
}

function verifyMerkleProof(commitment, siblings, expectedRoot) {
  if (!Array.isArray(siblings) || siblings.length > 32) return false
  let node = leafHash(commitment)
  for (const sibling of siblings) node = parentHash(node, bytes32(sibling))
  return `0x${node.toString("hex")}` === String(expectedRoot).toLowerCase()
}

module.exports = { buildMerkleTree, verifyMerkleProof }
