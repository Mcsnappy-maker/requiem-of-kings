# Durable multiplayer: local setup, deployment and Stage 1 gate

The browser is a static Vite app; online matches run in `multiplayer/`, a Cloudflare
Worker with one SQLite-backed `MatchRoom` Durable Object per match. Local and AI play
remain available without the service. Stage 1 supports untimed private matches,
single-use invites, private return links, persisted moves, retries and seat takeover.
Clocks, resignation, rematches, expiry and token rotation are not implemented here.

**Hosted deployment and the manual cross-device gate are BLOCKED until the owner
authorises access to their Cloudflare and Vercel projects.** Tests and CI do not deploy.
Do not paste account credentials or private player links into a report.

## Requirements

- Node **22.12.0 or newer** and npm for the Worker and full verification. CI uses Node 22.
- An owner-controlled Cloudflare account with Workers and SQLite Durable Objects
  available, permission to deploy `requiem-multiplayer`, and a configured workers.dev
  subdomain or Worker custom domain for hosted use.
- An owner-controlled Vercel project for the `web/` app and its exact HTTPS origin.
- For deployment only, authenticate interactively with `npx --prefix multiplayer
  wrangler login`, then verify the account with `npx --prefix multiplayer wrangler whoami`.
  Local runtime tests and dry runs need no hosted account.

Commands below run from the repository root in PowerShell unless stated otherwise.
Use the pinned local Wrangler installed by `npm ci --prefix multiplayer`.

## Local development

In the first terminal:

```powershell
npm ci --prefix multiplayer
npm run dev --prefix multiplayer
```

The script runs `wrangler dev --env development` from `multiplayer/`, normally at
`http://localhost:8787`. Its persisted local state is under `.wrangler/`; keep that
directory when testing local stop/start recovery. This is separate from production.

In a second terminal:

```powershell
npm ci --prefix web
$env:VITE_MULTIPLAYER_HTTP_URL = "http://localhost:8787"
$env:VITE_MULTIPLAYER_WS_URL = "ws://localhost:8787"
npm run dev --prefix web
```

Open `http://localhost:8080`. The development environment explicitly allows that origin
and `http://127.0.0.1:8080`. If port 8080 is occupied, free it or deliberately update
`env.development.vars.ALLOWED_ORIGINS` for the chosen port; Vite's fallback port is not
automatically trusted. These two Vite variables are public **origins only**, with no
API path, username, query, fragment or player token. The client appends its own paths.
The old `/ws` proxy, `MULTIPLAYER_TARGET` and `VITE_MULTIPLAYER_URL` belong to the legacy
relay and do not configure the durable client. Avoid running both services on 8787.

## Production origin configuration and dry run

In `multiplayer/wrangler.jsonc`, set the top-level `vars.ALLOWED_ORIGINS` to the exact
Vercel/custom-domain HTTPS origin, for example `https://chess.example.com`. Multiple
explicit origins are comma-separated. Include no paths, trailing slash or wildcard.
Each Vercel preview domain needs its own entry if it should be able to play; do not
enable arbitrary previews. The default empty value denies all API origins.

Keep the `MATCHES` binding, exported `MatchRoom` SQLite storage declaration, Worker
name and compatibility date intact. The `development` environment has a separate
origin allowlist; do not deploy it as production. Keep the chosen production origins
in the configuration used for each deploy so later deployments do not reset them.

```powershell
npm run typecheck --prefix multiplayer
npx --prefix multiplayer wrangler deploy --dry-run --config multiplayer/wrangler.jsonc --env=""
```

The explicit configuration path is required when invoking from the repository root:
`--prefix multiplayer` selects the executable but does not change Wrangler's working
directory. `--env=""` selects the top-level environment. A successful dry run validates
the bundle and bindings locally; it does not prove account permissions or hosted access.
See [Wrangler deploy options](https://developers.cloudflare.com/workers/wrangler/commands/workers/).

## Owner-run first deploy and health check

After the owner has authenticated and confirmed the account and origin configuration:

```powershell
npx --prefix multiplayer wrangler deploy --config multiplayer/wrangler.jsonc --env=""
```

Record the returned Worker origin and version ID without any player tokens. With the
actual origin substituted for the example below:

```powershell
Invoke-RestMethod "https://requiem-multiplayer.example.workers.dev/health"
```

Expected JSON: `{"ok":true,"protocol":2,"service":"requiem-multiplayer"}`. Health is
public; also confirm the allowlisted browser can create a match and an unlisted Origin
receives `403` on `/api/matches`. Hosted API traffic must use HTTPS and sockets WSS.

## Vercel configuration

Configure the project root directory as `web`, install command `npm ci`, build command
`npm run build`, output directory `dist`, and a supported Node 22 runtime. Set these
environment variables for the intended Production/Preview deployment before building:

| Variable | Value using the actual deployed Worker origin |
| --- | --- |
| `VITE_MULTIPLAYER_HTTP_URL` | `https://requiem-multiplayer.example.workers.dev` |
| `VITE_MULTIPLAYER_WS_URL` | `wss://requiem-multiplayer.example.workers.dev` |

These values are compiled into the public browser bundle. Never put a host, join or
guest token, a Cloudflare API token, or account credentials into a Vite variable.
Rebuild/redeploy the web app after changing them. Confirm its final origin exactly
matches the Worker allowlist. No relay server is needed for this path.

## Smoke test and log redaction

1. Open Online Duel in two separate browser profiles. Create a match as White and
   save **Copy my return link**. Send only **Copy opponent invite** to the other profile.
2. Claim the guest seat and save **Save my return link** before entering the duel.
   Trying the original invite from a third profile must show the used-invite error.
3. Play `e2-e4`, `e7-e5`, `g1-f3`. Close both game tabs, reopen the two saved private
   return links, and confirm identical board, Black to move and the three-move ledger.
   Locally, stop/restart Wrangler between closing and reopening without deleting its
   state directory. Do not delete hosted storage to simulate this.
4. Open the host return link in a third profile. The prior host must show
   **This seat opened on another device** and stop accepting moves. Play `b8-c6` from
   the resumed guest; the guest and replacement host must both show four plies.
5. Inspect browser requests: player tokens belong in the private URL fragment or
   authentication WebSocket frame, never HTTP URLs, query strings or request logs.
   A successful claim/resume clears the visible fragment; the browser saves the seat
   locally. Private return links remain bearer credentials even after copying them.
6. In an owner-controlled terminal, run `npx --prefix multiplayer wrangler tail
   --config multiplayer/wrangler.jsonc --env=""` while exercising creation, claim,
   invalid authentication, moves and takeover. Inspect browser console and Worker logs
   for absence of raw host/join/guest tokens, auth payloads and full private links.
   Do not add frame/body logging, export token-bearing HAR files, or paste credentials
   into the check record. Record pass/fail and public origins only.

## Automated verification gate

Run once from a fresh dependency installation:

```powershell
npm ci --prefix multiplayer
npm test --prefix multiplayer
npm run typecheck --prefix multiplayer
npx --prefix multiplayer wrangler deploy --dry-run --config multiplayer/wrangler.jsonc --env=""
npm ci --prefix web
npx --prefix web playwright install chromium
npm test --prefix web
npm run build --prefix web
npm ci --prefix server
node server/e2e-multiplayer.mjs
git diff --check
```

All commands must exit 0. CI additionally installs Chromium's system dependencies.
`multiplayer/test/e2e-durable-match.test.ts` sends HTTP and real WebSocketPair traffic
through the actual Worker in Cloudflare's local test runtime. It creates/claims a match,
rejects invite reuse, plays three plies, closes both sockets and evicts the Durable
Object with storage preserved. New sockets resume both private seats; fixed FEN, ledger
and version assertions check restoration. A repeated request does not add a move. A
second eviction exercises live-socket hibernation before host takeover and a fourth
legal guest move. There are no protocol mocks, seeded matches or storage rewrites.

This is a runtime-level E2E, not a browser-to-hosted-service test. Web tests separately
cover UI/client behavior; `server/e2e-multiplayer.mjs` retains the legacy relay regression.
Generated browser screenshots/attachments are ignored, not deleted. Passing automation
does not complete the hosted cross-device gate below.

## Manual cross-device gate: BLOCKED

After owner-authorised deployment, use a PC browser and a phone on a different network
(for example phone mobile data). Create/claim a match, save both private links, play at
least four legal plies, and close both. Reopen each player's private link on the opposite
device type: host on phone and guest on PC. Confirm identical board, turn and move ledger,
then make another legal move and check both displays. Check a same-seat takeover too.

Record date, commit, Worker version, browser/device types, network separation, public
Worker/web origins, tested plies and each outcome. Redact the entire credential in every
link (`#match=<public-id>&seat=[REDACTED]`, likewise `join=[REDACTED]`). Do not record a
successful gate until it is actually performed. Current status: **BLOCKED — no
owner-authorised hosted deployment or PC/phone run has been performed by this task.**

## Rollback

Before an update, record the last known-good compatible Worker version ID:

```powershell
npx --prefix multiplayer wrangler deployments list --config multiplayer/wrangler.jsonc --env=""
npx --prefix multiplayer wrangler versions list --config multiplayer/wrangler.jsonc --env=""
```

If an update fails smoke tests, the owner can select that recorded version:

```powershell
npx --prefix multiplayer wrangler rollback <PRIOR_VERSION_ID> --config multiplayer/wrangler.jsonc --env="" --message "Restore last known-good multiplayer version"
```

Replace the placeholder before execution. Check `/health`, private-link resume and a
legal move again. A code rollback does not restore match storage; select code compatible
with the current schema and bindings. A Durable Object migration can prevent rollback
to an older version; do not delete data or undo migrations to force it. A first-ever
deployment has no prior Worker version. If the web bundle also changed, restore the
compatible prior Vercel deployment through the owner's project. See Cloudflare's
[rollback procedure and limitations](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).
