# Local JSON-RPC chain development

This guide is for isolated local contract development and proof-pipeline integration.

1. Install the Solidity compiler and deployment dependencies with `npm install` from `blockchain/`.
2. Start a local JSON-RPC EVM of your choice on port `8545` with chain ID `1337`. The repository does not bundle a development chain.
3. Set the local RPC URL and a disposable local signer in the ignored root `.env`:

   ```env
   BLOCKCHAIN_RPC=http://127.0.0.1:8545
   BLOCKCHAIN_CHAIN_ID=1337
   BLOCKCHAIN_PRIVATE_KEY=<disposable local development key>
   ```

4. Compile and deploy the commitment-only contract:

   ```bash
   npm run compile
   npm run deploy:local
   ```

Keep local secrets in the ignored `.env` file. Never fund or reuse a development key on a public network.

The deployed contract accepts an owner-authorized Merkle root and leaf count. It does not accept message text, ciphertext, user IDs, or recipient IDs. The backend batching worker remains independent of chat delivery. Deploying the replacement does not erase data from an older contract; any prior public-chain data remains public.
