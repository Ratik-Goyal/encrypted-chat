# Cipher product direction and production roadmap

This roadmap is based on the current source. It proposes a position worth validating with user interviews and a competitor review; it does not claim Cipher is the first or only product to offer these ideas.

## Product direction: verifiable privacy

The strongest product direction is a **privacy receipt** for each conversation. The current receipt covers message encryption, homeserver-visible metadata, identity verification, expiry, and chain-proof status. It should grow to include:

- Which devices and identity keys are involved, whether the user verified them with a QR safety code, and whether a key changed. Cipher now exposes device IDs, fingerprints, and Matrix trust state in the verification view.
- Which encrypted messaging provider is active and which data Cipher and the homeserver can see.
- What a disappearing-message timer means, when it starts, and what the service retains after it expires.
- Whether a message commitment is included in a public batch and how to verify an inclusion proof.

The integrity receipt must describe its narrow proof: inclusion of a commitment and that the committed bytes match. It cannot prove identity, delivery, truth, or that nobody copied the message. A public chain must never receive plaintext, ciphertext, account IDs, or recipient IDs.

## Implemented in this pass

- Socket handshakes verify JWTs and session versions. Message senders come from the verified session; private message events are sent to the two participant rooms. Admin events require the server-side admin role.
- Backend integration checks exercise the actual HTTP and Socket.IO service against disposable MongoDB with production cookie/origin rules: rejected credentials, all six admin events (including daily message counts), scoped history/export, forged participant IDs, receipt routing, disabled legacy sends, safe errors, and session revocation. Deployed cross-instance behavior still needs validation.
- Registration, login, friend-request, and per-socket event limits are enforced. The legacy message-send event is disabled. Production requires a database URI, a generated 32+ byte JWT secret, and explicit CORS origins; the server waits for MongoDB and has live/readiness endpoints and graceful shutdown.
- New Matrix sends use stable transaction IDs and SDK retry behavior. Cipher's legacy message history remains participant-scoped and excludes records past their expiry time.
- Legacy prototype messages may use a timer starting at send or first read. This behavior does not apply to new Matrix messages; MongoDB TTL cleanup for old records is eventual.
- Presence, read receipts, typing visibility, status text, and profile photos can be saved. Users can export account data, revoke sessions, or delete their account and message history. Admin accounts are operator-provisioned and admin pages have a client-side route gate in addition to server authorization.
- New direct messages use the official Matrix JavaScript SDK and its Rust-backed crypto implementation. Cipher verifies an `m.megolm.v1.aes-sha2` room state before sending, creates private invite-only rooms, uses a cross-tab Web Lock for the crypto store, and refuses new sends through the old Cipher message socket event.
- Matrix crypto uses `OnlySignedDevicesIsolationMode`: room keys are shared only with cross-signed devices, and events from unsigned devices are not decrypted. The privacy receipt explains that new devices may need owner verification and cross-signing before they can read room history.
- First-time recovery setup initializes Matrix cross-signing. Each conversation's privacy receipt can request Matrix emoji/SAS verification, show the comparison code, report Matrix-detected identity changes, and require explicit confirmation that both sides match. Cipher blocks new sends while Matrix says a changed contact identity still needs approval.
- Incoming Matrix invites from known Cipher accounts are shown in the conversation list and joined only after the user opens them.
- First-time Matrix recovery setup displays a one-time recovery key, requires a user acknowledgment, and bootstraps Matrix encrypted key backup before chat access. The Matrix access token is persisted only after recovery is ready.
- Contact and peer-device verification supports Matrix QR codes and emoji/SAS, with the Matrix SDK performing the cryptographic flow. Device-targeted requests are checked against the requested device ID. QR payloads are encoded and decoded as bytes in the browser; Cipher does not upload the scan or verification code.
- Contact verification listens for Matrix identity and device-list changes. It alerts on changed account identities and new or changed unverified device fingerprints, comparing against a local browser snapshot of previously trusted devices. It sends no fingerprint snapshot to the Cipher backend; a fresh browser has no historical fingerprint baseline and still shows current device trust state.
- A new browser can restore Matrix cross-signing keys and a trusted encrypted room-key backup using the recovery key. Cipher validates the key locally, displays restore progress, and does not persist it or upload it to the Cipher backend.
- Settings lists Matrix devices and can revoke other devices after Matrix password reauthentication. Per-device trust status is inspectable in the contact verification view.
- Settings can link another Matrix device by requesting device-targeted verification, comparing QR codes or SAS in person, and relying on Matrix cross-signing. Cipher requires the current device's cross-signing identity before starting a link flow.
- Matrix direct-message history can be exported from this browser after paging each direct encrypted room's available timeline. Cipher reports events the current device cannot decrypt; the export does not include recovery keys or include data no longer available from the homeserver.
- New Matrix messages can carry an encrypted send-time or first-visible expiry. Cipher hides an expired message and requests Matrix redaction. The request is best effort: offline devices, copies, screenshots, homeserver retention, and backups can preserve data.
- File attachments use Matrix's Rust crypto-WASM encrypted attachment format. Cipher uploads ciphertext without a server-side filename, checks the ciphertext hash before download decryption, and does not preview files. The public build-time `NEXT_PUBLIC_MATRIX_ATTACHMENT_MAX_MB` setting controls the per-file cap from 1 to 20 MiB; expiry redacts the event but cannot guarantee removal of the media blob or backups.
- Cipher API and Socket.IO sessions use an 8-hour HttpOnly, SameSite=Strict cookie (Secure in production); API mutations require an exact configured Origin. A per-request nonce CSP allows the configured Matrix/API origins and Matrix WebAssembly crypto.
- The privacy receipt now describes Matrix message encryption, homeserver-visible metadata, unverified contact identity, legacy records, and integrity-proof status. Device-local notification preferences support desktop alerts and a short sound while the app is open in the background.
- Each new Matrix message carries a random-salt SHA-256 commitment in the encrypted event. The API stores only the commitment; a MongoDB worker forms delayed Merkle batches, retries owner-authorized root commits, and retains inclusion data. The UI verifies the decrypted message against its commitment and checks the returned Merkle path. Chain anchoring is optional and does not block delivery.
- The Solidity contract stores only owner-authorized batch roots and leaf counts. No message, ciphertext, salt, account, or recipient data is sent to the contract.
- The chat receipt verifies the message commitment and Merkle inclusion path locally. When configured, it also queries a browser-visible read-only RPC to check chain ID, contract code, stored batch root and count, the commit event and transaction, canonical block hash, and a confirmation threshold. Without this public configuration the UI says the chain root was not independently checked.
- Socket.IO can use the MongoDB adapter for cross-instance broadcasts when `SOCKET_IO_ADAPTER=mongo`; startup rejects MongoDB deployments without change streams.

## Release blockers

### P0 — security and privacy

1. **Independent cryptographic and application security review.** Matrix encrypts new message bodies, but this integration, local key handling, recovery flow, room identity mapping, and complete application threat model have not been independently reviewed. No production security claim should be made before review.
2. **Session and browser hardening.** Cipher session JWTs use an HttpOnly cookie and a nonce CSP is configured. The Matrix SDK access token persists in browser storage for a maximum of eight hours so the app can reconnect across tabs and reloads without repeatedly asking for the recovery key; same-origin script injection can access it during that window. The CSP permits inline style attributes used by UI components. Review token handling, CSP behavior, cookie deployment topology, and the web threat model independently before public production deployment.
3. **Identity and multi-device recovery.** Cipher provides user and device-targeted QR and emoji/SAS verification, reports Matrix-detected identity changes, blocks sends while a changed identity needs approval, restores cross-signing and trusted room-key backups in a new browser, exposes per-device trust state, can revoke other sessions, and can link another device through QR/SAS verification. Only cross-signed devices receive room keys or have their events decrypted; validate recovery and linking flows against supported production homeservers and clients. Per-device block/distrust controls remain incomplete. A username mapping alone does not establish a person's real-world identity.
4. **Retention, export, and deletion span two services.** Matrix history export and best-effort expiry/redaction are implemented, but expiry cannot guarantee deletion from offline devices, screenshots, copies, federation, or backups; export is limited to history available to this device and its keys. The delete flow requests Matrix deactivation and erasure and attempts to clear this browser's crypto store, but homeserver policy and other room members prevent Cipher from guaranteeing complete history deletion. A definite Cipher validation rejection attempts cleanup of a newly created Matrix account; network failures and account conflicts preserve Matrix so a possibly completed Cipher enrollment is not destroyed. Define and test cross-service enrollment recovery and retention/deletion policy. Legacy Cipher records remain Base64-readable by the app backend.
5. **Matrix homeserver operations.** Select and operate a production homeserver; verify TLS, CORS, registration tokens, abuse controls, rate limits, media/backup retention, restore drills, uptime monitoring, data residency, incident response, and upgrade procedures.
6. **Blockchain proofs need operational review.** The backend worker, durable inclusion data, receipt API, and client checks are implemented, but chain configuration is optional. Validate contract ownership, signer isolation, confirmation depth, reorg handling, RPC availability, queued-batch alerting, and privacy claims on the selected chain. Retire the former contract. If its data was deployed, it is permanently public.

### P1 — reliability and operations

- HTTP and socket event limits use shared MongoDB buckets, and proxy/IP trust is explicitly configured. `SOCKET_IO_ADAPTER=mongo` enables cross-instance broadcasts; production still needs replica-set or sharded MongoDB change streams, sticky sessions when Socket.IO polling is enabled, and deployed adapter health monitoring.
- Cipher shows Matrix reconnect and catch-up states, pauses sending until sync is live, and offers a reload action to reinitialize the SDK after a stopped connection. Validate automatic catch-up and retry behavior against the selected production homeserver; define tested failover expectations and recovery across devices.
- Configure encrypted backups, a restore drill, backup expiry, incident response, secret rotation, monitoring, alerts, and dependency update procedures. Validate the chosen homeserver's encrypted media upload/download, effective upload limit, retention, and backup behavior. Root, backend, and blockchain `npm audit` reported zero known advisories on 2026-10-13; repeat the audits as dependencies and advisories change.
- Shared Zod schemas validate all server-emitted Socket.IO payloads and the user, chat, admin, and chart listeners that consume them. Remaining `any` annotations are concentrated in Matrix SDK callback boundaries and unrelated legacy UI code.
- Review accessibility, browser support, privacy notices, data export/deletion behavior, and uploaded-image storage. Decide retention for MongoDB backups and third-party infrastructure.

### P2 — product differentiation

- Add per-device block/distrust controls if supported by a reviewed Matrix SDK policy API; the current cross-signed-device isolation mode is account-level, not a per-device blacklist.
- Validate independent browser chain checks against the selected RPC provider, supported chain, deployment, reorgs, and finality policy; define recovery for delayed or orphaned batches. Treat chain outages as independent of chat delivery.
- Extend the privacy receipt into an inspectable view of verified devices, key changes, retention, server-visible data, and verified proof status.
- Validate the configured per-file attachment cap, expiry, and media-retention behavior with the selected homeserver. Cipher supports a per-file cap from 1 to 20 MiB; account-level storage quotas remain homeserver policy.

## Release gate

Do not call Cipher production-ready until an unauthenticated socket cannot read or mutate user data; one user cannot receive another user's or admin data; new app sends cannot bypass Matrix; Matrix rooms and file attachments are encrypted and contact/device identity verification is usable; attachment hash failures are rejected; key restore and deletion span both services; expiry and media-retention claims match tested homeserver behavior; Matrix access tokens are handled under a reviewed threat model; production startup fails without required dependencies and secrets; homeserver and Cipher backups can be restored; dependency advisories have been triaged; and the E2EE implementation has passed an independent security review. Public-chain data must contain no message or participant information.

## Product validation

Before advertising “different from the market,” interview target users about whether verifiable key identity, inspectable retention, and privacy-preserving integrity proofs solve a problem they have. Compare the resulting experience with current secure messengers and blockchain audit products, and make only claims supported by the implemented protocol and review.
