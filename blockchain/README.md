# Cipher integrity contract

`IntegrityCommitments.sol` stores only owner-authorized batch Merkle roots, leaf counts, and timestamps. It has no message, ciphertext, salt, room, recipient, or account storage. The browser creates a salted SHA-256 commitment for each new Matrix message and embeds the commitment plus salt inside the Matrix-encrypted event. The backend receives only the commitment, batches it in MongoDB, and commits the root when blockchain configuration is present. A proof endpoint returns a Merkle inclusion path; the browser checks the decrypted body against the salt and the path against the root.

The chain feature is optional. Without all of `BLOCKCHAIN_RPC`, `BLOCKCHAIN_CONTRACT_ADDRESS`, `BLOCKCHAIN_CHAIN_ID`, and `BLOCKCHAIN_PRIVATE_KEY`, messages still send normally and commitments wait in MongoDB. Underfilled batches wait up to `INTEGRITY_MAX_BATCH_WAIT_MS`; `INTEGRITY_BATCH_SIZE` caps each batch. The proof UI distinguishes a queued commitment from an anchored and locally verified proof. The backend checks the RPC chain ID before committing or serving a chain-backed receipt.

## Local development

Install the small compiler/deployment toolchain and compile:

```bash
npm install
npm run compile
```

Run a local JSON-RPC EVM separately with chain ID `1337`. Put its RPC URL and a disposable development signer in the ignored root `.env`, then run `npm run deploy:local`. The script verifies the chain ID, compiles with the pinned `solc` range, deploys with `ethers`, waits for a receipt, and writes the address and deployment transaction to ignored `deployment.json`. No local chain binary or seed phrase is bundled in this package.

## Testnet deployment

Use a dedicated testnet key funded only for deployment and batch submissions. Set `SEPOLIA_RPC_URL` and `SEPOLIA_PRIVATE_KEY` in the ignored root `.env` or a secret manager, then run `npm run deploy:sepolia`. The script refuses a network whose chain ID is not Sepolia. Review compiler output and contract ownership before deployment. Verify published source in the chain explorer using the printed compiler version and optimizer settings.

The transaction sender and batch roots are public. A root proves only that a salted commitment was included in a batch; it does not prove identity, delivery, or truth. Do not submit plaintext, ciphertext, salts, user IDs, recipient IDs, or wallet-to-user mappings. Configure `BLOCKCHAIN_CONFIRMATIONS` for the chain's finality policy and use a dedicated, funded signer key held in a deployment secret manager.

## Migration warning

The previous contract version stored recipient identifiers and message content. Deploying this replacement does not remove old chain records. If the former version was deployed, consider its data permanently public and retire that contract. Do not reuse its address with the new service ABI.

## Remaining before production

- Independent review of the commitment encoding, Merkle construction, worker lease/retry behavior, contract, and chain finality policy.
- Shared rate limits, alerting for a growing queued backlog, signer key rotation, chain outage recovery, and database backup/restore drills.
- A policy for chain reorganizations, proof availability during RPC outages, and eventual pruning of local inclusion data.
