# Local setup

Cipher uses a Next.js frontend, an Express/Socket.IO account and profile backend, MongoDB, and a separate Matrix homeserver for new encrypted messages.

## Configure services

Copy `.env.example` to the project-root `.env`, then set the backend values and these Matrix frontend values:

```env
NEXT_PUBLIC_MATRIX_HOMESERVER_URL=https://matrix.example.org
NEXT_PUBLIC_MATRIX_SERVER_NAME=example.org
```

Use the actual homeserver API URL and the Matrix server name from its configuration. The server name becomes the domain in user IDs such as `@alice:example.org`. Configure Matrix CORS to allow the Cipher frontend origin, including media upload/download requests. Set the public build-time `NEXT_PUBLIC_MATRIX_ATTACHMENT_MAX_MB` to an integer from 1 to 20 MiB that fits the homeserver upload limit; the homeserver may impose a lower limit and controls media retention. For closed registration, issue individual Matrix registration tokens; do not expose homeserver administrator or shared-secret credentials to the browser.

The frontend and Cipher API must share a site so the `SameSite=Strict` session cookie is sent; using `localhost` on different ports works in development. In production, use HTTPS and same-site hostnames for the frontend and API, and set `CORS_ORIGIN` to the exact frontend origin.

Install and start the frontend at the project root:

```bash
npm install
npm run dev
```

Start the backend in a second terminal:

```bash
cd backend
npm install
npm run dev
```

Open `http://localhost:3000`. Node.js 22 or newer is required by the pinned Matrix SDK. Keep a reachable persistent MongoDB URI in the project-root `.env`; if it cannot connect, the backend now fails startup instead of silently switching to temporary data. A development-only in-memory fallback is used only when `MONGODB_URI` is omitted.

New sign-ups create the Cipher account and a matching Matrix account. Existing Cipher users are provisioned with a matching Matrix identity on first sign-in when the homeserver permits registration; an existing Matrix identity must use the same password. Homeservers requiring a token or operator approval need an administrator to provision the Matrix account. A first-time encryption recovery key must be saved before the app allows sign-in to chat.

## Provision an admin

Add `ADMIN_BOOTSTRAP_EMAIL` and a 16-character-or-longer `ADMIN_BOOTSTRAP_PASSWORD` to the root `.env`, then run `npm run create-admin` from `backend/`. Remove the bootstrap password afterward.

## Before real users

Read [README.md](README.md) and the release gate in [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md). Matrix message bodies are end-to-end encrypted and can carry a salted integrity commitment; the API stores only its hash and offers a Merkle proof after on-chain anchoring. Cipher still needs independent security review, complete device and recovery flows, safer Matrix-token handling, homeserver operational controls, shared abuse controls, and reviewed deletion and retention behavior before production use. Earlier prototype messages remain Base64-readable by the Cipher backend. Blockchain anchoring is optional and does not block message delivery.

To activate anchoring, configure backend-only `BLOCKCHAIN_RPC`, `BLOCKCHAIN_CONTRACT_ADDRESS`, `BLOCKCHAIN_CHAIN_ID`, `BLOCKCHAIN_PRIVATE_KEY`, and `BLOCKCHAIN_CONFIRMATIONS` in a secret manager. The key must belong to the configured contract owner. Until then, commitments remain queued and chat delivery continues. `INTEGRITY_BATCH_SIZE`, `INTEGRITY_MAX_BATCH_WAIT_MS`, and `INTEGRITY_BATCH_INTERVAL_MS` control batching.

For independent browser verification, set `NEXT_PUBLIC_BLOCKCHAIN_READ_RPC_URL`, `NEXT_PUBLIC_BLOCKCHAIN_CONTRACT_ADDRESS`, and `NEXT_PUBLIC_BLOCKCHAIN_CHAIN_ID` to a public read-only endpoint and the same deployed contract/network. Optionally set `NEXT_PUBLIC_BLOCKCHAIN_CONFIRMATIONS`. All `NEXT_PUBLIC_` values are visible to users; never put a signing key or private RPC credential in them.
