# Cipher backend

Express and Socket.IO service backed by MongoDB. It handles Cipher accounts, profiles, privacy settings, and legacy-message export. New encrypted messages use the Matrix homeserver directly from the browser; the backend rejects the old `send-message` event. Historical prototype messages are still Base64-readable and are not end-to-end encrypted.

## Local setup

The backend reads the project-root `.env` file. Example:

```env
NODE_ENV=development
PORT=3001
MONGODB_URI=mongodb://localhost:27017/cipher
CORS_ORIGIN=http://localhost:3000
JWT_SECRET=replace-with-a-random-secret-of-at-least-32-characters
```

Set `CORS_ORIGIN` to the exact frontend origin, including its port. Cookie authentication requires an explicit origin in development too; `CORS_ORIGIN=*` is rejected at startup.

Install and start:

```bash
npm install
npm run dev
```

If `MONGODB_URI` is omitted in development, the backend may start a temporary in-memory MongoDB. That data is lost when the process exits. If a URI is configured but cannot be reached, startup fails instead of silently switching databases. Production always requires a reachable persistent MongoDB.

## Admin provisioning

Set `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD` in the root `.env`, with a password of at least 16 characters, then run:

```bash
npm run create-admin
```

Remove the bootstrap password from the environment afterward. There are no default admin accounts.

## Production requirements

Set `NODE_ENV=production`, `MONGODB_URI`, a random `JWT_SECRET` of at least 32 bytes, and explicit comma-separated HTTPS `CORS_ORIGIN` values. Startup waits for MongoDB and creates the shared rate-limit TTL index. Put the service behind HTTPS/WSS and use a secret manager. Rate limits are stored in MongoDB so they apply across backend instances. Set `TRUST_PROXY_HOPS` to the exact number of trusted reverse proxies; keep it `0` for direct connections, and configure the edge proxy to overwrite forwarded-IP headers.

`SOCKET_IO_ADAPTER=memory` is the single-instance default. For multiple backend instances, set `SOCKET_IO_ADAPTER=mongo`; startup verifies that MongoDB is a replica set or sharded cluster, creates a TTL index for adapter events, and fails if change streams are unavailable. Configure sticky sessions at the load balancer while Socket.IO polling is enabled. Monitor MongoDB change-stream health and preserve the adapter event collection's TTL index.

Health checks:

- `GET /health/live`
- `GET /health/ready`
- `POST /api/auth/register` and `POST /api/auth/login`; set the `cipher_session` HttpOnly cookie and return a public profile
- `POST /api/auth/logout`; clears the current session cookie
- `GET /api/me`; returns the current public profile from the session cookie
- `GET /api/me/export`; returns Cipher-side profile and legacy-message records from the session cookie
- `POST /api/me/logout`; revokes all sessions for the account and clears the cookie
- `DELETE /api/me`; deletes the account, conversations, and messages, then clears the cookie
- `POST /api/integrity/commitments`; accepts a salted SHA-256 commitment only, never message content or identity metadata
- `GET /api/integrity/proofs/:commitment`; returns queued state or an inclusion proof after checking the batch against the configured contract

The browser must send credentials on API calls. The cookie is host-only, HttpOnly, SameSite=Strict, and Secure in production; mutating API requests require an exact allowed `Origin`. The frontend and API must be same-site. Socket.IO authenticates from that cookie with credentialed CORS rather than a JavaScript-readable handshake token. Admin events check the account role. Profile events are scoped to the authenticated user. The old `get-conversation` event can return historical legacy messages; the account export includes Cipher-side profile and legacy records, not Matrix rooms or messages. Review `server.js` and the product release gate before deployment.

## Verification

Run the backend checks with `npm test` from `backend/` after installing both root and backend dependencies. The access-control integration suite launches the real service with production cookie/origin rules, a random session secret, an ephemeral port, and a disposable MongoDB database. It checks unauthenticated and expired sessions, all admin socket events, conversation/export isolation, forged participant IDs, receipt routing, disabled legacy sends, safe error responses, and session revocation. Configuration checks require production startup to reject missing secrets and invalid origins. The first run may download the MongoDB test binary. These checks do not validate Matrix encryption or a deployed multi-instance service.

## Important limitations

- Legacy records use reversible Base64 encoding, not encryption. New Matrix message bodies do not pass through this service.
- The backend deletes Cipher-side data only. The settings flow separately requests Matrix account deactivation with `erase=true`; homeserver policy, other room members, federation, and backups can prevent complete history erasure.
- MongoDB TTL cleanup is eventual; it does not guarantee exact-second deletion or remove old backups.
- Message history currently returns at most 500 records and has no cursor pagination.
- Integrity commitments and batch leaves are stored without account, room, or message references. Chain anchoring is optional; without blockchain configuration, commitments remain queued and messages still send. MongoDB rate-limit buckets use hashed keys and TTL cleanup is eventual. Horizontal Socket.IO deployments still need a shared adapter and operational monitoring.
- Matrix E2EE, contact/device verification, backup restoration, and device linking are implemented in the browser. Their behavior against the selected production homeserver, independent security review, operational monitoring, and backup/restore procedures remain release requirements.
