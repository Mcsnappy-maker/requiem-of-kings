# Requiem of Kings Stage 0–1 Durable Multiplayer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first vertical slice in which two browsers create and join a private match, submit authoritative legal moves, close, and resume their correct seats and persisted position through private cross-device links.

**Architecture:** Keep the Vite/React/Three.js game on Vercel and preserve the existing `OnlineClient`/`OnlineBridge` boundary. Add a TypeScript Cloudflare Worker containing one SQLite-backed `MatchRoom` Durable Object per match, using WebSocket Hibernation for live messages and Durable Object storage for canonical state. The browser creates a match over HTTPS, then both seats authenticate to the room WebSocket by sending secrets in the first frame; private links place secrets in the URL fragment so credentials do not reach Vercel, access logs or referrer headers.

**Tech Stack:** React 19, TypeScript, Vite 8, Three.js, chess.js 1.4, Cloudflare Workers, SQLite-backed Durable Objects, Hibernation WebSockets, Wrangler, Vitest, `@cloudflare/vitest-pool-workers`.

**Spec:** `docs/superpowers/specs/2026-11-13-requiem-of-kings-family-multiplayer-design.md`

## Global Constraints

- Preserve the root MIT licence and existing attribution.
- The Vercel-hosted browser client and Cloudflare match service remain separate deployables.
- No accounts, passwords, email addresses, chat, public matchmaking or paid service is introduced.
- A match has one host-seat secret, one one-time join secret and one guest-seat secret after claim; every secret contains at least 128 bits of cryptographic entropy.
- Durable storage contains only SHA-256 token hashes; raw tokens may be returned once and held by the relevant browser but never logged or persisted by the service.
- Private links use the fragment format `#match=<matchId>&seat=<token>` or `#match=<matchId>&join=<token>`; fragments are never sent in HTTP requests.
- Stage 1 supports untimed matches only. Existing 5/10/15-minute live clocks remain available in local modes and are added to durable online matches in Stage 2.
- One live connection controls each seat; a newer valid connection closes the prior one with error code `seat-replaced`.
- Disconnect never forfeits or vacates a seat.
- Browsers never apply an online move until the Durable Object accepts it.
- Canonical state is persisted before an accepted move is acknowledged or broadcast.
- Protocol and rules versions are present in every handshake; Stage 1 increments `PROTOCOL_VERSION` from `1` to `2`.
- Production origins are allowlisted through Worker configuration; local development allows only `http://localhost:8080` and `http://127.0.0.1:8080`.
- Do not delete the existing Node relay during Stage 1; keep it as a reference until the Cloudflare vertical slice passes and deprecation is approved.
- Dependency installs must generate committed lockfiles; do not use floating runtime imports.

## Review Focus

- A replayed one-time join token must fail with `join-consumed` and must never reveal the guest seat secret.
- Retrying the same move frame after a lost acknowledgement must not apply the move twice; the service returns the already-committed canonical state for that request ID.
- A newer connection using the same seat token must take control deterministically while the older socket receives `seat-replaced` and can no longer move.
- A Durable Object evicted and reconstructed between moves must restore the identical FEN, move list, seat hashes and state version before processing a message.
- Malformed, oversized, wrong-origin, wrong-version and wrong-seat traffic must fail without changing durable state or echoing any credential.

---

## File Structure

### New Cloudflare service

- `multiplayer/package.json` — service scripts and pinned dependencies.
- `multiplayer/package-lock.json` — reproducible dependency graph.
- `multiplayer/tsconfig.json` — Worker TypeScript settings.
- `multiplayer/wrangler.jsonc` — Worker entry point, origin variables, Durable Object binding and declarative SQLite export.
- `multiplayer/vitest.config.ts` — Workers Vitest pool configuration.
- `multiplayer/src/env.ts` — `Env` binding/variable types and origin parsing.
- `multiplayer/src/protocol.ts` — versioned wire messages, parse guards and error codes shared internally by Worker code.
- `multiplayer/src/secrets.ts` — secret generation and SHA-256 hashing.
- `multiplayer/src/match-state.ts` — serialisable match schema and pure authoritative state transitions.
- `multiplayer/src/match-room.ts` — Durable Object persistence, WebSocket authentication, hibernation attachments and broadcasting.
- `multiplayer/src/index.ts` — public HTTP create/health routes, WebSocket routing, CORS and security headers.
- `multiplayer/test/secrets.test.ts` — entropy/format/hash/redaction tests.
- `multiplayer/test/match-state.test.ts` — pure creation, join, move, replay and restore tests.
- `multiplayer/test/match-room.test.ts` — Durable Object persistence and WebSocket integration tests.
- `multiplayer/test/worker.test.ts` — public route, CORS, version and error-contract tests.

### Existing browser client

- `web/src/net/protocol.ts` — version 2 client wire contract, IDs, secrets, state version and failures.
- `web/src/net/privateLink.ts` — fragment parsing, fragment removal, local seat persistence and private-link construction.
- `web/src/net/matchApi.ts` — HTTPS match creation contract.
- `web/src/net/onlineClient.ts` — Cloudflare connection flow, claim/resume authentication, deduplicated move requests and seat replacement.
- `web/src/net/onlineBridge.ts` — include request IDs/state versions and resynchronise on mismatch.
- `web/src/ui/OnlineLobby.tsx` — create/join/return-link flow with untimed default.
- `web/src/ui/GameShell.tsx` — reconnect and seat-replaced messaging where the existing network status is rendered.
- `web/src/test/multiplayer.test.ts` — client protocol and link-security unit tests.
- `web/src/test/onlineLobby.browser.test.tsx` — browser-level deep-link, claim and safe address-bar behaviour.
- `web/.env.example` — documented `VITE_MULTIPLAYER_HTTP_URL` and `VITE_MULTIPLAYER_WS_URL` variables.

### Documentation and automation

- `docs/baseline/STAGE_0_BASELINE.md` — reproducible baseline, licence, dependency, test/build and known-risk record.
- `docs/decisions/0001-vercel-cloudflare-multiplayer.md` — selected architecture and rejected alternatives.
- `docs/deploy/CLOUDFLARE_MULTIPLAYER.md` — local development, secrets-free configuration, deploy and rollback steps.
- `.github/workflows/verify.yml` — clean installs, service tests, web tests and production build.

---

### Task 1: Record and automate the verified baseline

**Files:**
- Create: `docs/baseline/STAGE_0_BASELINE.md`
- Create: `docs/decisions/0001-vercel-cloudflare-multiplayer.md`
- Create: `.github/workflows/verify.yml`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: existing root, `web/package-lock.json`, `server/package-lock.json`, root `LICENSE`, approved design spec.
- Produces: one CI job contract named `verify` and a written baseline against which all later tasks are compared.

- [ ] **Step 1: Capture the clean baseline commands and expected evidence**

Run from a clean checkout:

```powershell
npm ci --prefix web
npm test --prefix web
npm run build --prefix web
npm ci --prefix server
node server/e2e-multiplayer.mjs
```

Expected: web unit/browser tests pass, Vite production build exits `0`, and the Node relay end-to-end script reports every check passing. Record exact counts, Node/npm versions, current baseline commit, Vite warnings and the npm audit summary in `docs/baseline/STAGE_0_BASELINE.md`; do not claim audit findings were fixed.

- [ ] **Step 2: Document the architecture decision**

In `docs/decisions/0001-vercel-cloudflare-multiplayer.md`, record status `Accepted`, the Vercel + Cloudflare decision, why Vercel-only and Supabase were rejected, and the consequence that two deployables and origin configuration are required.

- [ ] **Step 3: Add CI without changing product behaviour**

Create `.github/workflows/verify.yml` for pushes and pull requests. Use Node 20, `npm ci` in `web` and `server`, install Playwright Chromium, run `npm test --prefix web`, `npm run build --prefix web`, and `node server/e2e-multiplayer.mjs`.

- [ ] **Step 4: Ignore only Cloudflare local state and generated output**

Add `.wrangler/`, `multiplayer/coverage/` and `multiplayer/dist/` to `.gitignore`. Do not ignore Worker source, configuration or lockfiles.

- [ ] **Step 5: Verify Stage 0**

Run the commands from Step 1 again and validate the workflow syntax with the repository's available YAML tooling or GitHub Actions editor. Expected: no regression from the recorded baseline and only documentation/workflow/ignore changes in `git diff --check`.

- [ ] **Step 6: Commit**

```bash
git add .gitignore .github/workflows/verify.yml docs/baseline/STAGE_0_BASELINE.md docs/decisions/0001-vercel-cloudflare-multiplayer.md
git commit -m "docs: record multiplayer baseline and architecture"
```

### Task 2: Scaffold the tested Durable Object service

**Files:**
- Create: `multiplayer/package.json`
- Create: `multiplayer/package-lock.json`
- Create: `multiplayer/tsconfig.json`
- Create: `multiplayer/wrangler.jsonc`
- Create: `multiplayer/vitest.config.ts`
- Create: `multiplayer/src/env.ts`
- Create: `multiplayer/src/index.ts`
- Create: `multiplayer/src/match-room.ts`
- Create: `multiplayer/test/worker.test.ts`

**Interfaces:**
- Consumes: Cloudflare Workers runtime and the approved origin policy.
- Produces: `Env { MATCHES: DurableObjectNamespace<MatchRoom>; ALLOWED_ORIGINS: string }`, Worker `fetch(request, env, ctx): Promise<Response>`, and exported `MatchRoom` using SQLite storage.

- [ ] **Step 1: Write failing Worker route tests**

In `multiplayer/test/worker.test.ts`, assert:

- `GET /health` returns `200` and `{ ok: true, protocol: 2, service: "requiem-multiplayer" }`.
- an allowlisted `Origin` receives that exact `Access-Control-Allow-Origin` plus `Vary: Origin`.
- an unknown origin receives `403` on every `/api/*` route.
- an unknown route returns JSON `404` with no stack trace.

- [ ] **Step 2: Run tests to verify the harness fails**

Run: `npm test --prefix multiplayer`

Expected: FAIL because the Worker configuration and entry point do not exist.

- [ ] **Step 3: Add the Worker project and bindings**

Use `wrangler.jsonc` with `compatibility_date: "2026-11-13"`, `main: "src/index.ts"`, binding `MATCHES` to class `MatchRoom`, and declarative export storage `sqlite`. Pin resolved Wrangler, TypeScript, Vitest, Workers types and Workers Vitest pool versions in `package-lock.json`.

- [ ] **Step 4: Implement only health, origin parsing and JSON errors**

Implement:

```ts
export interface Env {
  MATCHES: DurableObjectNamespace<MatchRoom>;
  ALLOWED_ORIGINS: string;
}

export function allowedOrigins(env: Env): ReadonlySet<string>;
export function corsHeaders(request: Request, env: Env): Headers;
```

Export `MatchRoom` as a minimal `DurableObject<Env>` placeholder whose `fetch()` returns JSON `501`; later tasks replace that response.

- [ ] **Step 5: Run service checks**

Run:

```powershell
npm test --prefix multiplayer
npm run typecheck --prefix multiplayer
npx --prefix multiplayer wrangler deploy --dry-run
```

Expected: route tests pass, TypeScript exits `0`, and Wrangler validates the SQLite Durable Object binding without deploying.

- [ ] **Step 6: Commit**

```bash
git add multiplayer
git commit -m "feat: scaffold durable multiplayer worker"
```

### Task 3: Implement secrets and the serialisable match state

**Files:**
- Create: `multiplayer/src/secrets.ts`
- Create: `multiplayer/src/protocol.ts`
- Create: `multiplayer/src/match-state.ts`
- Create: `multiplayer/test/secrets.test.ts`
- Create: `multiplayer/test/match-state.test.ts`

**Interfaces:**
- Consumes: `chess.js` and protocol version `2`.
- Produces:

```ts
export type SeatId = "host" | "guest";
export type WireColor = "w" | "b";
export type MatchStatus = "waiting" | "active" | "complete" | "expired";

export interface StoredSeat {
  color: WireColor;
  tokenHash: string;
  name: string;
}

export interface MatchRecord {
  schemaVersion: 1;
  protocolVersion: 2;
  matchId: string;
  status: MatchStatus;
  fen: string;
  moves: WireMove[];
  stateVersion: number;
  host: StoredSeat;
  guest: StoredSeat | null;
  joinTokenHash: string | null;
  createdAt: number;
  updatedAt: number;
  result: WireResult | null;
  recentRequests: Array<{ requestId: string; outcomeVersion: number }>;
}

export function createSecret(byteLength?: number): string;
export async function hashSecret(secret: string): Promise<string>;
export function createMatch(input: CreateMatchInput): MatchRecord;
export function claimGuest(record: MatchRecord, tokenHash: string, name: string): ClaimOutcome;
export function resumeSeat(record: MatchRecord, tokenHash: string): SeatId | null;
export function applyMove(record: MatchRecord, seat: SeatId, request: MoveRequest): MoveOutcome;
export function toWireState(record: MatchRecord): WireGameState;
```

- [ ] **Step 1: Write failing secret tests**

Assert `createSecret()` returns URL-safe base64 without padding, decodes to 32 random bytes by default, two calls differ, and `hashSecret()` returns a stable lowercase SHA-256 hex digest that does not contain the raw token.

- [ ] **Step 2: Write failing state-transition tests**

Cover: initial waiting state; host colour assignment; successful one-time guest claim; replayed claim returns `join-consumed`; correct seat recovery by hash; wrong hash rejection; legal `e2-e4`; wrong-turn and illegal move rejection; repeated `requestId` does not add another move; state version increments exactly once; serialise/recreate from JSON and continue with `e7-e5`.

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `npm test --prefix multiplayer -- secrets.test.ts match-state.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Implement the minimal pure modules**

Use Web Crypto for secrets/hashes and `chess.js` for canonical legality. Store the last 128 `{ requestId, outcomeVersion }` entries in `MatchRecord.recentRequests`, evicting the oldest entry when a successful move would exceed the limit, so retry is idempotent without unbounded growth. Sanitise aliases to trimmed printable text, maximum 20 Unicode code points, default `Challenger`.

- [ ] **Step 5: Run focused and full service checks**

Run:

```powershell
npm test --prefix multiplayer -- secrets.test.ts match-state.test.ts
npm test --prefix multiplayer
npm run typecheck --prefix multiplayer
```

Expected: all service tests pass and no raw token appears in snapshots or failure output.

- [ ] **Step 6: Commit**

```bash
git add multiplayer/src multiplayer/test
git commit -m "feat: add durable match state and secret model"
```

### Task 4: Add create routing, durable persistence and one-time guest claim

**Files:**
- Modify: `multiplayer/src/index.ts`
- Modify: `multiplayer/src/match-room.ts`
- Modify: `multiplayer/src/protocol.ts`
- Modify: `multiplayer/test/worker.test.ts`
- Create: `multiplayer/test/match-room.test.ts`

**Interfaces:**
- Consumes: Task 3 state/secrets functions.
- Produces:

```ts
// POST /api/matches
interface CreateMatchResponse {
  matchId: string;
  hostToken: string;
  joinToken: string;
  state: WireGameState;
}

// MatchRoom internal HTTP routes
POST /internal/create
GET /ws
```

- [ ] **Step 1: Write failing creation and persistence tests**

Assert `POST /api/matches`:

- requires protocol `2` and an allowlisted origin;
- accepts `{ name, color: "w" | "b" | "random" }` only;
- returns a non-secret `matchId`, distinct raw `hostToken`/`joinToken`, and waiting state;
- stores only the two hashes in the Durable Object;
- can reload the object from storage and reproduce the same public state;
- never includes tokens in console output or later state responses.

- [ ] **Step 2: Write failing WebSocket claim tests**

Connect two Worker test WebSockets to `/api/matches/:matchId/ws`. The first sends `{ t: "resume", v: 2, token: hostToken }`; the second sends `{ t: "claim", v: 2, token: joinToken, name: "Guest" }`. Assert both receive `seated`, state becomes active, the guest receives a new `seatToken`, and replaying `joinToken` on a third socket returns fatal `join-consumed`.

- [ ] **Step 3: Run tests to confirm failure**

Run: `npm test --prefix multiplayer -- worker.test.ts match-room.test.ts`

Expected: FAIL because create and WebSocket routes are not implemented.

- [ ] **Step 4: Implement atomic create and claim**

The Worker generates `matchId`, host token and join token, derives `env.MATCHES.idFromName(matchId)`, and calls `/internal/create` with hashes and public creation data. The Durable Object persists key `match` before returning success. The WebSocket upgrade carries no credential in its URL; the first client frame must authenticate within one message. Use `ctx.acceptWebSocket(server, [seatTag])` only after successful resume/claim and `serializeAttachment({ seat, tokenHash })` for hibernation recovery.

- [ ] **Step 5: Verify persistence and dry-run**

Run:

```powershell
npm test --prefix multiplayer
npm run typecheck --prefix multiplayer
npx --prefix multiplayer wrangler deploy --dry-run
```

Expected: create/claim/replay/reload tests pass and Wrangler produces a valid bundle.

- [ ] **Step 6: Commit**

```bash
git add multiplayer/src multiplayer/test
git commit -m "feat: create and claim persistent match seats"
```

### Task 5: Add authoritative moves, hibernation recovery and seat takeover

**Files:**
- Modify: `multiplayer/src/match-room.ts`
- Modify: `multiplayer/src/protocol.ts`
- Modify: `multiplayer/test/match-room.test.ts`

**Interfaces:**
- Consumes: authenticated WebSockets and `applyMove()` from Task 3.
- Produces:

```ts
interface MoveRequest {
  t: "move";
  v: 2;
  requestId: string;
  expectedVersion: number;
  from: string;
  to: string;
  promotion: "q" | "r" | "b" | "n" | null;
}

interface StateMessage {
  t: "state";
  state: WireGameState;
}
```

- [ ] **Step 1: Extend failing WebSocket tests**

Cover legal host move broadcast to both seats, guest out-of-turn rejection, illegal move rejection, stale `expectedVersion` response with canonical state, retry of the same `requestId`, object reconstruction between moves, and a newer host connection closing the prior host connection with `seat-replaced`.

- [ ] **Step 2: Add hostile-input tests**

Cover malformed JSON, frames over 64 KB, unknown message type, invalid square/promotion, more than 20 messages per second, wrong protocol, unauthenticated move and a token-shaped value in an error path. Assert durable state remains unchanged and responses do not echo input secrets.

- [ ] **Step 3: Run tests to confirm failure**

Run: `npm test --prefix multiplayer -- match-room.test.ts`

Expected: new assertions fail.

- [ ] **Step 4: Implement hibernation-safe message handling**

Implement `webSocketMessage`, `webSocketClose` and `webSocketError` on `MatchRoom`. Load `match` from storage at construction/request boundaries, recover seat identity from socket attachments, validate and apply one message inside the Durable Object's serial event order, persist `match`, then broadcast `state`. Do not use `setInterval`; Stage 1 is untimed and must remain hibernation eligible.

- [ ] **Step 5: Verify all service behaviours**

Run:

```powershell
npm test --prefix multiplayer
npm run typecheck --prefix multiplayer
```

Expected: all pure, route and WebSocket tests pass with no leaked tokens.

- [ ] **Step 6: Commit**

```bash
git add multiplayer/src multiplayer/test
git commit -m "feat: validate and persist online moves"
```

### Task 6: Add safe private-link and match API support to the browser

**Files:**
- Create: `web/src/net/privateLink.ts`
- Create: `web/src/net/matchApi.ts`
- Modify: `web/src/net/protocol.ts`
- Modify: `web/src/test/multiplayer.test.ts`
- Create: `web/.env.example`

**Interfaces:**
- Consumes: Worker `CreateMatchResponse`, WebSocket URL and protocol version 2.
- Produces:

```ts
export type PrivateIntent =
  | { kind: "seat"; matchId: string; token: string }
  | { kind: "join"; matchId: string; token: string };

export function readPrivateIntent(location: Pick<Location, "hash">): PrivateIntent | null;
export function clearPrivateFragment(history: Pick<History, "replaceState">, location: Location): void;
export function buildSeatLink(origin: string, pathname: string, matchId: string, token: string): string;
export function buildJoinLink(origin: string, pathname: string, matchId: string, token: string): string;
export function saveSeat(intent: Extract<PrivateIntent, { kind: "seat" }>): void;
export function loadSeat(matchId: string): Extract<PrivateIntent, { kind: "seat" }> | null;
export async function createRemoteMatch(input: CreateMatchInput): Promise<CreateMatchResponse>;
```

- [ ] **Step 1: Write failing fragment-security tests**

Assert valid seat/join fragments parse, malformed/short tokens fail closed, link builders place credentials after `#`, `clearPrivateFragment()` removes the fragment without navigation, and storage failures do not throw. Assert no helper puts a token in `search`, pathname or HTTP URL.

- [ ] **Step 2: Write failing API contract tests**

Mock `fetch` and assert `createRemoteMatch()` sends only display name/colour/protocol, never sends a seat token, rejects non-2xx JSON safely, validates the returned shape and reads base URLs only from `VITE_MULTIPLAYER_HTTP_URL`.

- [ ] **Step 3: Run focused tests to confirm failure**

Run: `npm test --prefix web -- src/test/multiplayer.test.ts`

Expected: FAIL because the new helpers and protocol fields do not exist.

- [ ] **Step 4: Implement protocol 2 and link helpers**

Update `PROTOCOL_VERSION` to `2`; add `matchId`, `stateVersion`, `requestId`, `claim`, `join-consumed`, `seat-replaced` and version-mismatch types/guards. Store seat tokens in `localStorage` under `rok.online.seats.<matchId>` only after removing the fragment; do not keep the old single `sessionStorage` seat as the authoritative source.

- [ ] **Step 5: Run web verification**

Run:

```powershell
npm test --prefix web
npm run build --prefix web
```

Expected: all existing and new tests pass; production output contains no literal test token.

- [ ] **Step 6: Commit**

```bash
git add web/.env.example web/src/net web/src/test/multiplayer.test.ts
git commit -m "feat: add secure private match links"
```

### Task 7: Adapt `OnlineClient` and bridge to the Durable Object protocol

**Files:**
- Modify: `web/src/net/onlineClient.ts`
- Modify: `web/src/net/onlineBridge.ts`
- Modify: `web/src/test/multiplayer.test.ts`

**Interfaces:**
- Consumes: Task 6 API/link helpers and protocol 2 Worker messages.
- Produces:

```ts
host(name: string, seat: SeatPreference): Promise<HostedMatch>;
claim(intent: Extract<PrivateIntent, { kind: "join" }>, name: string): void;
resume(intent?: Extract<PrivateIntent, { kind: "seat" }>): boolean;
getReturnLink(): string | null;
sendMove(from: SquareId, to: SquareId, promotion: PromotionPiece): string; // requestId
```

- [ ] **Step 1: Write failing client state-machine tests**

Using fake `fetch`, `WebSocket` and storage, cover create → host resume, one-time claim → guest seat persistence, page reopen → local resume, private link on a different browser → resume, reconnect after close, state-version mismatch, duplicate acknowledgement, and `seat-replaced` terminal status.

- [ ] **Step 2: Run focused tests to confirm failure**

Run: `npm test --prefix web -- src/test/multiplayer.test.ts`

Expected: FAIL against the version 1 `OnlineClient`.

- [ ] **Step 3: Implement the new connection state machine**

Resolve HTTP/WS origins from separate Vite variables. On host creation, call HTTPS create, immediately save the host seat, connect `/api/matches/:matchId/ws`, and send `resume` as the first frame. On join, send `claim`, replace the one-time join intent with the returned guest seat, clear the fragment and expose the return link. Generate one `crypto.randomUUID()` per move intent and retain it across retries until a newer canonical state confirms it.

- [ ] **Step 4: Keep the bridge server-first**

Change `OnlineBridge` to include `expectedVersion`, reject input while an unresolved move is in flight, and replace local state from any canonical `state` response before re-enabling input. Do not replay scene animations for moves already present in the local move ledger.

- [ ] **Step 5: Run the full web suite and build**

Run:

```powershell
npm test --prefix web
npm run build --prefix web
```

Expected: all tests pass and the existing local/AI modes still build unchanged.

- [ ] **Step 6: Commit**

```bash
git add web/src/net web/src/test/multiplayer.test.ts
git commit -m "feat: connect browser to durable matches"
```

### Task 8: Deliver the create, invite, join and return-link user journey

**Files:**
- Modify: `web/src/ui/OnlineLobby.tsx`
- Modify: `web/src/ui/GameShell.tsx`
- Create: `web/src/test/onlineLobby.browser.test.tsx`
- Modify: `web/vitest.browser.config.ts`

**Interfaces:**
- Consumes: updated `OnlineClient`, `PrivateIntent`, return/join link builders.
- Produces: user-visible Stage 1 journey and browser-level evidence.

- [ ] **Step 1: Write failing browser tests**

Cover:

- Online Duel defaults to `Untimed` and does not offer online clocks in Stage 1.
- Host sees separate **Copy opponent invite** and **Copy my return link** actions.
- Opening a join fragment selects the join flow and clears the credential from the visible address after claim.
- Guest sees **Save my return link** after successful claim.
- reopening a seat link resumes without asking for a room code;
- a replayed join link shows an expired/used message;
- `seat-replaced` shows **This seat opened on another device** and disables board input;
- clipboard failure presents selectable fallback text without logging the link.

- [ ] **Step 2: Run browser test to confirm failure**

Run: `npm run test:browser:run --prefix web -- src/test/onlineLobby.browser.test.tsx`

Expected: FAIL because the version 1 lobby has only `?room=CODE` links.

- [ ] **Step 3: Implement the Stage 1 lobby journey**

Remove the online clock picker for Stage 1, retain optional alias and colour choice, call async host creation, display the two distinct links, parse a fragment intent on mount, and add plain-language warnings that private return links control a seat. Keep room codes as non-secret human-readable labels but do not permit code-only seat claims.

- [ ] **Step 4: Implement recovery feedback**

Use existing connection status UI for reconnecting/resynchronising. Add explicit fatal states for used invite, expired room, invalid private link, incompatible client and seat opened elsewhere. Every fatal state offers a route back to the main menu without reloading.

- [ ] **Step 5: Run complete client verification**

Run:

```powershell
npm test --prefix web
npm run build --prefix web
```

Expected: unit and browser tests pass; Vite build exits `0`.

- [ ] **Step 6: Commit**

```bash
git add web/src/ui web/src/test/onlineLobby.browser.test.tsx web/vitest.browser.config.ts
git commit -m "feat: add private invite and return journey"
```

### Task 9: Prove the vertical slice end to end and document deployment

**Files:**
- Create: `multiplayer/test/e2e-durable-match.test.ts`
- Modify: `.github/workflows/verify.yml`
- Create: `docs/deploy/CLOUDFLARE_MULTIPLAYER.md`
- Modify: `README.md`
- Modify: `web/README.md`

**Interfaces:**
- Consumes: complete Stage 1 Worker and browser client.
- Produces: automated two-client proof, local/deployment instructions and the Stage 1 gate evidence.

- [ ] **Step 1: Write the failing two-client end-to-end scenario**

The test must use the real local Worker runtime and two real WebSocket clients:

1. create match;
2. connect host with host token;
3. claim guest with join token;
4. reject a third replayed claim;
5. play `e2-e4`, `e7-e5`, `g1-f3`;
6. close both sockets;
7. restart/reconstruct the Durable Object test context without reseeding state;
8. resume host and guest using their private tokens;
9. assert both receive the same FEN, three-move ledger and state version;
10. retry the last request ID and assert no fourth move;
11. open host on another socket and assert the prior host is replaced;
12. complete one further legal move from the resumed guest.

- [ ] **Step 2: Run the scenario and confirm it fails before final wiring**

Run: `npm test --prefix multiplayer -- e2e-durable-match.test.ts`

Expected: FAIL until every route and hibernation path is wired.

- [ ] **Step 3: Make the minimal fixes required by the real scenario**

Fix only defects exposed by the scenario. Do not add Stage 2 clocks, resignation, rematch, expiry or token rotation here.

- [ ] **Step 4: Document local and hosted configuration**

`docs/deploy/CLOUDFLARE_MULTIPLAYER.md` must include Cloudflare login prerequisites, local `wrangler dev`, Vite variables, allowed-origin configuration, dry run, first deploy, health check, Vercel environment variables, smoke test, log redaction check and rollback to the prior Worker version. State clearly that deploy requires owner-controlled Cloudflare and Vercel accounts and is not performed by tests.

- [ ] **Step 5: Extend CI**

Add `npm ci --prefix multiplayer`, `npm test --prefix multiplayer`, `npm run typecheck --prefix multiplayer` and `wrangler deploy --dry-run` before web tests/build. Keep the legacy relay E2E check until its later deprecation decision.

- [ ] **Step 6: Run the Stage 1 verification gate**

Run fresh:

```powershell
npm ci --prefix multiplayer
npm test --prefix multiplayer
npm run typecheck --prefix multiplayer
npx --prefix multiplayer wrangler deploy --dry-run
npm ci --prefix web
npx --prefix web playwright install chromium
npm test --prefix web
npm run build --prefix web
npm ci --prefix server
node server/e2e-multiplayer.mjs
git diff --check
```

Expected: every command exits `0`; the durable E2E scenario proves create/join/move/restart/resume/takeover; the original local/AI tests and legacy relay scenario remain green.

- [ ] **Step 7: Perform the manual cross-device gate after owner-authorised deployment**

Use one PC browser and one phone on a different network. Create, claim, make at least four legal plies, close both, reopen each private link on the opposite device type, and confirm identical board, turn and move ledger. Record URLs only with tokens redacted. This step is `BLOCKED` until the owner provides or authorises access to the Cloudflare and Vercel projects.

- [ ] **Step 8: Commit**

```bash
git add .github/workflows/verify.yml multiplayer/test/e2e-durable-match.test.ts docs/deploy/CLOUDFLARE_MULTIPLAYER.md README.md web/README.md
git commit -m "test: verify durable multiplayer vertical slice"
```

---

## Stage 1 Exit Checklist

- [ ] Clean install, all Worker tests, all web tests, web build and legacy relay E2E pass.
- [ ] Two real clients create, claim and exchange authoritative legal moves.
- [ ] Durable state survives object reconstruction and both clients closing.
- [ ] Each private seat link resumes the correct seat in a fresh browser profile.
- [ ] Replayed join token, duplicated move request and concurrent same-seat connection behave exactly as specified.
- [ ] Raw tokens are absent from durable storage, logs, URLs before `#`, error responses and CI output.
- [ ] Cloudflare dry run validates SQLite Durable Object configuration.
- [ ] Documentation distinguishes verified local behaviour from owner-blocked hosted verification.
- [ ] No Stage 2 feature was added opportunistically.

## Deferred to the next approved plan

Stage 2 will cover online clocks, resignation, terminal-state broadcasting, rematches with colour swap, token rotation, 90/30-day expiry alarms, privacy copy and full adversarial lifecycle tests. Stage 3 will cover the cross-device 3D performance and asset pipeline. Neither is part of this implementation plan.
