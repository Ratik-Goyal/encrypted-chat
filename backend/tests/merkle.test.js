const assert = require("node:assert/strict")
const test = require("node:test")
const { buildMerkleTree, verifyMerkleProof } = require("../utils/merkle")

const leaves = [
  `0x${"11".repeat(32)}`,
  `0x${"22".repeat(32)}`,
  `0x${"33".repeat(32)}`,
]

test("Merkle proofs verify every leaf in odd-sized batches", () => {
  const tree = buildMerkleTree(leaves)

  for (let index = 0; index < leaves.length; index += 1) {
    assert.equal(verifyMerkleProof(leaves[index], tree.proofFor(index), tree.root), true)
  }
})

test("Merkle proofs reject a changed leaf or sibling", () => {
  const tree = buildMerkleTree(leaves)
  const proof = tree.proofFor(1)
  const alteredSibling = `0x${"44".repeat(32)}`

  assert.equal(verifyMerkleProof(`0x${"55".repeat(32)}`, proof, tree.root), false)
  assert.equal(verifyMerkleProof(leaves[1], [alteredSibling, ...proof.slice(1)], tree.root), false)
})

test("single-leaf batches have an empty inclusion path", () => {
  const tree = buildMerkleTree([leaves[0]])

  assert.deepEqual(tree.proofFor(0), [])
  assert.equal(verifyMerkleProof(leaves[0], [], tree.root), true)
})

test("Merkle builders reject empty batches and invalid proof indices", () => {
  assert.throws(() => buildMerkleTree([]), /cannot be empty/)
  const tree = buildMerkleTree(leaves)
  assert.throws(() => tree.proofFor(-1), /Invalid Merkle leaf index/)
  assert.throws(() => tree.proofFor(leaves.length), /Invalid Merkle leaf index/)
  assert.throws(() => buildMerkleTree(["not-a-commitment"]), /32-byte hexadecimal/)
})

test("proof verification bounds proof depth", () => {
  const excessiveProof = Array(33).fill(leaves[0])
  assert.equal(verifyMerkleProof(leaves[0], excessiveProof, leaves[0]), false)
})
