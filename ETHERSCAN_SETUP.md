# Testnet contract verification

This optional guide applies only to the replacement contract, which stores owner-authorized batch roots and leaf counts. Cipher submits only batch roots; it never sends message or participant data to the contract.

Before any public testnet deployment:

1. Review the contract source and the network configuration.
2. Use a dedicated testnet account with limited funds. Never use a main wallet key or a Ganache key.
3. Keep `SEPOLIA_PRIVATE_KEY`, `SEPOLIA_RPC_URL`, and `ETHERSCAN_API_KEY` in an ignored local `.env` file or a secret manager.
4. Compile with `npm run compile`, review the compiler version and optimizer settings, and deploy with `npm run deploy:sepolia` from `blockchain/`.
5. In Etherscan's contract verification page, select Solidity, the compiler version printed by the deploy script, optimizer enabled with 200 runs, and submit the source from `blockchain/contracts/IntegrityCommitments.sol`.

Transactions and batch roots are public. Do not submit message content, ciphertext, salts, user IDs, recipient IDs, or wallet mappings. A chain root alone does not prove identity or end-to-end encryption. See [blockchain/README.md](blockchain/README.md) for migration limitations.
