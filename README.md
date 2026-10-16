# Cipher

Cipher is a messaging app prototype built around privacy disclosures, encrypted direct rooms, and privacy-preserving integrity commitments. New chat messages use Matrix end-to-end encryption in the browser through the official `matrix-js-sdk` Rust crypto implementation. Cipher is **not production-ready**; an independent security review and operational work remain before handling real users.

See [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) for implemented scope, remaining release blockers, and product direction.

## Current capabilities

- New direct chats use private Matrix rooms whose encryption state is checked before Cipher sends a message. The Cipher backend rejects the legacy message-send event.
- Chat shows Matrix reconnect and catch-up status and pauses sends until sync resumes. If the SDK stops, users can reload the tab to reinitialize it; unsent drafts should be copied first.
- Incoming encrypted room invitations appear in the contact list and are joined only when the user opens that conversation.
- New account registration creates a matching Matrix account when the homeserver permits registration or a valid registration token is supplied.
- On sign-in, an existing Cipher user without a Matrix account is provisioned on the configured homeserver when its registration policy allows it. A pre-existing Matrix account must use the same password as the Cipher account.
- Matrix encryption keys are stored by the SDK in browser IndexedDB. A cross-tab Web Lock prevents two Cipher clients from opening the same crypto store at once.
- The SDK shares room keys only with cross-signed devices and accepts encrypted events only from cross-signed devices. Users need to verify and cross-sign new devices before they can decrypt room history.
- Cipher alerts when Matrix reports a changed contact identity or a new/changed unverified device key. Fingerprints are compared with previously trusted device keys saved in this browser; new unverified devices are always listed for review, and no fingerprint snapshot is sent to the Cipher backend.
- First-time Matrix recovery setup displays a system-generated recovery key with copy and download options, and enables Matrix encrypted key backup after the user confirms they saved it.
- On a new browser, Matrix recovery keys restore the cross-signing identity and a trusted room-key backup locally before Cipher saves the Matrix session. The recovery key is not sent to Cipher; backup restore progress is shown.
- Users who have lost the saved key can generate a replacement during sign-in. Generating it changes nothing on the homeserver; a separate confirmation that the new key is saved and older encrypted history may become unreadable is required before resetting the encryption identity and backup. The old key cannot be reconstructed from the account password.
- A per-conversation privacy receipt describes encryption, homeserver-visible metadata, contact verification state, and current retention limits. It offers Matrix QR verification and emoji/SAS verification through a separate trusted channel.
- Settings lists Matrix devices, can revoke other active devices after password confirmation, and can link an owned device through Matrix QR/SAS verification and cross-signing. Conversation verification details expose peer device IDs, fingerprints, and trust state, and can request verification of a specific peer device. A device-specific request requires the other device to be online and users to compare in person.
- Optional Matrix message timers can start at send or first visible read. Expiry hides a message in Cipher and requests room redaction, which is best effort and cannot erase copies or homeserver backups.
- File attachments are encrypted in the browser with Matrix's encrypted attachment format, uploaded without a server-side filename, and decrypted only after the ciphertext hash is checked. `NEXT_PUBLIC_MATRIX_ATTACHMENT_MAX_MB` configures the per-file cap from 1 to 20 MiB to match the homeserver. Cipher provides a download action; it does not preview files. Message expiry cannot guarantee deletion of uploaded media or homeserver backups.
- Cipher account data and locally decrypted Matrix direct-message history export as separate downloads. The Matrix export reports events this device cannot decrypt and cannot include unavailable or pruned history.
- Cipher accounts support profile and privacy settings, operator-provisioned admins, session revocation, account export, and deletion of Cipher-side records.
- New Matrix messages carry a salted SHA-256 commitment inside the encrypted event. The backend stores only the opaque commitment, builds delayed Merkle batches, and anchors roots when an operator configures a contract and signer. The chat receipt checks the decrypted message and Merkle proof; when public read-only RPC settings are configured, the browser also checks the contract root, event, canonical block, and confirmation count without trusting Cipher's API for those chain facts. Ordinary delivery does not depend on the chain.

## Security and privacy status

- Matrix encrypts new message bodies on the client. Cipher's application backend does not receive new Matrix message bodies. The configured Matrix homeserver still sees room membership, event timing, encrypted payload sizes, and connection metadata.
- Matrix device isolation uses `OnlySignedDevicesIsolationMode`: outbound room keys are limited to cross-signed devices and events from unsigned devices are not decrypted. This follows the Matrix SDK's recommended “Exclude insecure devices” mode; supported homeservers and multi-device recovery still require deployment validation.
- Matrix attachments use the SDK's Rust crypto WASM attachment format and are uploaded as ciphertext. Downloads verify the Matrix SHA-256 ciphertext hash before local decryption. The Matrix homeserver still learns upload timing, size, and network metadata; Cipher does not currently anchor attachment bytes in its public integrity proofs.
- Matrix username mapping uses `@<Cipher username>:<configured server name>`. Cipher can compare Matrix QR safety codes or emoji/SAS codes, reports Matrix-detected identity changes, and blocks sends while a changed identity needs approval. Users can inspect peer-device trust and request verification of a specific device; it requires a trusted physical comparison and does not prove a person's real-world identity. Separate per-device block/distrust controls are not implemented.
- Cipher's 8-hour session JWT is held in a host-only, HttpOnly, SameSite=Strict cookie; production cookies are Secure. Mutating API requests also require an allowed exact Origin. The Matrix SDK access token is kept in browser storage for the same bounded 8-hour window so reopening Cipher does not require another sign-in or recovery-key prompt. Same-origin scripts can access this token, so the nonce-based Content Security Policy and an independent security review remain important before public production deployment.
- First-device key backup and cross-signing are initialized after the user confirms the recovery key. On a new browser, Cipher can restore its cross-signing identity and a trusted Matrix key backup with the user's recovery key. Settings can verify and cross-sign another device using a Matrix QR or SAS flow, inspect and revoke other Matrix devices. Per-device block/distrust controls remain incomplete.
- Earlier prototype messages were stored as Base64, which is reversible. They remain visible as legacy messages and are readable by the Cipher backend. They are not migrated to Matrix.
- Optional Matrix message timers start when sent or when the recipient first sees a message. Cipher hides expired messages and asks the room to redact them; offline devices, screenshots, copies, and homeserver backups may retain data. Cipher profile/legacy export and locally decrypted Matrix direct-message history export are separate files. Matrix events this device cannot decrypt are reported. Account deletion requests Matrix deactivation and erasure, and clears the local Matrix crypto store when the browser allows it; other room members, federated servers, backups, and old public-chain records may retain copies.
- The former blockchain contract stored message data and recipient identifiers publicly. If that deployment was used, the records are permanent. Do not reuse it.
- Integrity submission stores a random-salt message hash, not content or account/room references. If chain configuration is absent or unavailable, commitments remain queued and the chat still works. A valid inclusion proof establishes only that a commitment was anchored and matches the decrypted message; it does not establish identity, delivery, or truth.
- Without `NEXT_PUBLIC_BLOCKCHAIN_READ_RPC_URL`, `NEXT_PUBLIC_BLOCKCHAIN_CONTRACT_ADDRESS`, and `NEXT_PUBLIC_BLOCKCHAIN_CHAIN_ID`, Cipher labels the Merkle proof valid but the chain root unverified. These browser settings are public; use a read-only RPC URL and never put a signing key there. The optional check bypasses Cipher's API for chain data but still trusts the configured RPC provider; it is not a light client.

## Local setup

Requirements: Node.js 22.13 or newer, MongoDB, and a Matrix homeserver that supports the Matrix Client-Server API, end-to-end encryption, and media upload/download. Set `NEXT_PUBLIC_MATRIX_ATTACHMENT_MAX_MB` at build time to an integer from 1 to 20 MiB that does not exceed the homeserver limit. This browser setting is public. The frontend scripts use Next.js's Webpack mode for the Matrix browser crypto WebAssembly bundle.

1. Copy `.env.example` to the project-root `.env`. Set the Cipher backend values and configure the public Matrix values:

   ```env
   NODE_ENV=development
   PORT=3001
   MONGODB_URI=mongodb://localhost:27017/cipher
   CORS_ORIGIN=http://localhost:3000
   NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
   JWT_SECRET=replace-with-a-random-secret-of-at-least-32-characters
   NEXT_PUBLIC_MATRIX_HOMESERVER_URL=https://matrix.example.org
   NEXT_PUBLIC_MATRIX_SERVER_NAME=example.org
   ```

   The Matrix server name must match the homeserver's actual Matrix user-ID domain; it may differ from the homeserver URL. These `NEXT_PUBLIC_` settings are public configuration, not secrets. Configure the homeserver CORS policy to allow the frontend origin and decide whether account registration uses per-user registration tokens. The frontend and Cipher API must be same-site for the Strict session cookie; localhost on different ports works for development. In production, host them on the same site and set `CORS_ORIGIN` to the exact frontend origin.

2. Start the frontend from the project root:

   ```bash
   npm install
   npm run dev
   ```

3. Start the backend in another terminal:

   ```bash
   cd backend
   npm install
   npm run dev
   ```

New sign-ups use the same username and password for the Cipher and Matrix identities. If the homeserver requires a registration token, enter the individual token issued by its operator. Do not put a homeserver admin token or shared registration secret in the frontend environment.

Existing Cipher users are provisioned with a matching Matrix identity on first sign-in when the homeserver permits registration. If registration requires a token or operator approval, the homeserver administrator must provision the identity. A pre-existing Matrix account must use the same password. Old Cipher messages remain in the legacy archive; they are not copied into Matrix.

## Create an admin account

Add `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD` to the root `.env`. Use a password of at least 16 characters, then run from `backend/`:

```bash
npm run create-admin
```

Remove the bootstrap password from the environment after provisioning. There are no default admin credentials.

## Production configuration

Set `NODE_ENV=production`, a MongoDB URI, a random `JWT_SECRET` of at least 32 bytes, explicit comma-separated HTTPS `CORS_ORIGIN` values, and HTTPS Matrix homeserver configuration. Put both services behind HTTPS/WSS, store secrets in a secret manager, configure encrypted backups and monitoring, and review Matrix registration, retention, abuse controls, and homeserver operations.

Health endpoints are `/health/live` and `/health/ready`.

Do not describe Cipher as production-ready or independently audited until the release gate in [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) is satisfied.

## Blockchain development

Blockchain use is optional and is not connected to ordinary message delivery. See [blockchain/README.md](blockchain/README.md) before compiling or deploying the commitment-only contract. Never put message text, ciphertext, account identifiers, or recipient identifiers on a public chain. Use a new deployment for the new contract; previously deployed data cannot be removed.

To independently check anchored roots in each chat, also set `NEXT_PUBLIC_BLOCKCHAIN_READ_RPC_URL`, `NEXT_PUBLIC_BLOCKCHAIN_CONTRACT_ADDRESS`, and `NEXT_PUBLIC_BLOCKCHAIN_CHAIN_ID` to a public read-only RPC and the deployed commitment contract. Optionally set `NEXT_PUBLIC_BLOCKCHAIN_CONFIRMATIONS`; these values are sent to the browser and must not contain signing credentials. Without them, the UI clearly reports that it verified the Merkle path but did not independently check the chain.

To enable automatic anchoring, configure `BLOCKCHAIN_RPC`, `BLOCKCHAIN_CONTRACT_ADDRESS`, `BLOCKCHAIN_CHAIN_ID`, and `BLOCKCHAIN_PRIVATE_KEY` for the backend only. Set `BLOCKCHAIN_CONFIRMATIONS` to the chain's finality policy. Use `INTEGRITY_BATCH_SIZE`, `INTEGRITY_MAX_BATCH_WAIT_MS`, and `INTEGRITY_BATCH_INTERVAL_MS` to control batch size and latency. Keep the signer key in a secret manager; never use a production wallet key in the browser.
