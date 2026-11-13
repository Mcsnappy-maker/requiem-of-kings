# Requiem of Kings — Family Multiplayer Design

**Status:** Recommended design awaiting owner approval  
**Date:** 13 November 2026  
**Baseline:** `ade5791/rork-medieval-3d-chess`, commit `4a2187c866892fda8de1e40e8a6ed5503559bad4`  
**Decision owner:** Project owner

## Intent

Turn the existing cinematic browser-chess prototype into **Requiem of Kings**, a free, link-shareable dark-fantasy 3D chess game that the owner, his son and their friends can play remotely on PCs, phones and tablets.

“£5m game” is a quality aspiration: disciplined art direction, responsive interaction, cinematic combat, strong audio, reliable online play and release-grade testing. It is not a claim about spend, team size or current completion.

## Product outcome

A player visits the Vercel-hosted game, creates a private duel and shares a one-time join link. The second player claims the opposing seat. Both then receive private return links that restore the correct seat and full match state on any supported device. They can leave, return later and continue until the match ends.

The core promise is:

> Open a link on almost any modern device and enter a dramatic, persistent 3D chess battle with someone you know.

## Goals

- Make remote two-player chess dependable before expanding spectacle or features.
- Preserve the animated 3D battle experience on PC, phone and tablet.
- Persist legal game state, player seats, clocks, move history and match result across disconnects and service restarts.
- Require no installation, registration, password, payment or app-store account.
- Keep the visible game and downloadable assets on Vercel's free hosting tier.
- Use Cloudflare Durable Objects as the invisible authoritative multiplayer and persistence service.
- Reuse the existing chess rules, AI, scene, animation, audio, quality presets and multiplayer protocol where sound.
- Preserve the MIT licence and attribution obligations of the baseline.
- Provide graceful recovery for dropped connections, sleeping phones and reopened links.
- Establish measurable quality gates for mobile performance, accessibility, security and release readiness.

## Non-goals for the first release

- Public matchmaking, rankings, tournaments or global leaderboards.
- Accounts, passwords, email collection or social sign-in.
- Public profiles, friend graphs, chat, voice chat or user-generated content.
- Monetisation, advertising, subscriptions or in-game purchases.
- Native mobile or desktop applications.
- More than two active players in one duel.
- Spectator mode.
- A complete replacement of the two existing civilisations or all existing art assets before the multiplayer foundation is proven.
- A claim that the initial release has achieved AAA or literal £5m production quality.

## Anti-goals

- Do not trade multiplayer reliability for visual effects.
- Do not make phone users use a flat 2D game as the default experience.
- Do not collect children's personal information to solve identity or reconnection.
- Do not trust either browser to validate moves or own the canonical position.
- Do not expose a reusable player-seat credential in analytics, logs, social previews or referrer headers.
- Do not introduce a large platform rewrite where the existing architecture can be adapted.

## Known baseline

The repository already provides:

- React 19, TypeScript, Vite and Three.js client architecture.
- `chess.js` rules with full chess legality and terminal-state handling.
- Web Worker AI, local two-player mode and showcase mode.
- Rigged 3D figures, movement and capture choreography, effects, audio and four battlegrounds.
- Adaptive graphics presets and a tactical camera.
- A typed WebSocket client, online lobby, invite codes, reconnect behaviour and server-authoritative move flow.
- A Node `ws` relay with in-memory rooms, seat tokens, clocks, rematches and an end-to-end multiplayer script.
- Passing unit and browser tests at setup time, plus a successful production build.

The current online implementation is not sufficient for this outcome because rooms exist only in memory, return credentials are stored in `sessionStorage`, the production relay is not deployed, and the client assumes a conventional WebSocket server.

## Users and critical journeys

### Primary users

- The owner, his son and invited friends.
- They may use different browsers, screen sizes and device performance levels.
- No researched demographic or purchasing behaviour is assumed.

### Journey A — create and invite

1. Player opens the Vercel URL.
2. Player chooses **Create private battle** and an optional display name.
3. The service creates a durable match and assigns the host seat.
4. The UI presents a one-time opponent join link and the host's private return link.
5. The host can copy or use the device share sheet.
6. The host waits in a visibly connected lobby without losing the room on refresh.

### Journey B — claim the second seat

1. Opponent opens the join link on any device.
2. Opponent chooses an optional display name and claims the unused seat.
3. The one-time join token is invalidated.
4. The opponent receives a private return link for that seat.
5. Both clients receive the same canonical initial state and the battle begins.

### Journey C — play and recover

1. A player selects a legal move.
2. The client submits it to the authoritative room.
3. The room validates turn, seat token, position and move legality.
4. The room commits the state before broadcasting the accepted move.
5. Both clients animate the same accepted event.
6. On disconnect, the board clearly reports reconnection without forfeiting immediately.
7. Reopening the private return link on any device restores that seat and canonical state.

### Journey D — finish and rematch

1. Checkmate, draw, timeout, resignation or abandonment creates a durable result.
2. Both players see the same result and move history.
3. Either may offer a rematch; both must accept.
4. A rematch resets the board while retaining the two private seats.
5. The players swap chess colours on each accepted rematch; private seat identity does not change.

## Identity and link security

- No account is created. Possession of a private return link is the seat credential.
- Each match has three distinct secrets: one host-seat token, one one-time join token and, after claim, one opponent-seat token.
- Tokens must contain at least 128 bits of cryptographic entropy.
- Durable storage keeps only token hashes, never raw return tokens.
- The join token becomes unusable immediately after the opponent seat is claimed.
- Seat tokens never appear in page titles, analytics events, logs or Open Graph metadata.
- The client removes tokens from the visible address bar after securely copying them into persistent browser storage, while retaining an explicit **Copy my return link** action.
- Cross-device recovery works by opening the complete private return link. Local storage is a convenience, not the source of identity.
- The interface warns players that anyone with their private return link can take their seat.
- A player can rotate their own seat token from an authenticated active seat; the previous token is invalidated.
- Display names are optional, short, sanitised aliases. No email, date of birth or real name is requested.
- Only one connection may control a seat at a time. Opening the same return link on another device makes the newest connection authoritative and closes the older connection with a clear **This seat opened on another device** message.

## Persistence policy

These are design calls made to keep planning concrete and may be changed by owner approval:

- Active and unfinished matches remain recoverable for **90 days after the last accepted move or rematch action**.
- Completed matches remain viewable and rematchable for **30 days after completion**.
- Expired matches return a clear message rather than silently creating a new room.
- Match persistence includes FEN, move history, clocks, result, seat names, rematch state, timestamps and a monotonically increasing state version.
- Raw private tokens, device fingerprints, chat content and unnecessary telemetry are never stored.
- Completed matches are viewable only through either valid private seat link. The first release creates no public replay or spectator link.

## Clock and abandonment rules

- Private online matches default to **Untimed**, which is the recommended choice for leave-and-return family play.
- Optional live time controls retain the baseline choices of **5, 10 or 15 minutes per player**, with no increment or delay.
- A live clock starts only after both seats are connected and White is permitted to move.
- In a timed match, a temporary disconnect does not pause either clock; the authoritative room may declare timeout while a player is away. The lobby must explain this before a timed match is created.
- Reconnecting to a timed match restores the authoritative remaining time or final timeout result.
- A disconnect, closed tab or sleeping device never counts as abandonment.
- The service records a loss only through checkmate, timeout or explicit resignation. Other terminal chess states are draws.
- An inactive unfinished match expires after 90 days without recording a winner or loser; the UI calls it **Expired**, not abandoned.

## Selected architecture

### Vercel — presentation tier

- Hosts the Vite production build, static assets, manifests and error pages.
- Provides immutable, cacheable fingerprinted assets.
- Supplies the public game URL and deployment previews.
- Does not own canonical match state.

### Cloudflare Worker and Durable Objects — match tier

- A Worker accepts create/join/resume requests and routes each match to exactly one Durable Object.
- One Durable Object represents one match and serialises all state transitions.
- The object validates tokens, seats, clocks and chess moves using the same rules version as the client.
- Durable Object storage commits state before an accepted move is acknowledged.
- WebSocket hibernation keeps inactive connections economical.
- CORS and origin checks allow the approved Vercel production and preview origins plus local development.
- The match service exposes a small health/version endpoint without match secrets.

### Client transport

- Preserve the existing `OnlineClient` and `OnlineBridge` boundaries.
- Replace assumptions tied to the Node relay with a configurable Cloudflare WebSocket/API base URL.
- Extend the protocol for durable state versions, one-time join claims, token rotation and explicit expiry.
- Keep server-first move submission: browsers never commit a multiplayer move optimistically.
- On reconnect or version mismatch, fetch/receive the complete canonical state before accepting input.

### Rules consistency

- The authoritative service uses `chess.js` and shared protocol/rules definitions.
- Client and service publish protocol and rules versions in the handshake.
- Incompatible clients receive a reload/update response rather than playing with divergent rules.

## Considered approaches

### 1. All services on Vercel

This would minimise the number of providers and preserve more of the Node relay. It was not selected because Vercel WebSocket support is currently public beta, connections are pinned only for a function's maximum duration, and future connections are not guaranteed to reach the same function instance. Durable shared state would still require another service.

### 2. Vercel plus Supabase Realtime/Postgres

This offers mature persistence and generous hobby quotas. It was not selected because the authoritative room model would require a larger redesign, and free projects may pause after inactivity, undermining a family return link.

### 3. Vercel plus Cloudflare Durable Objects — selected

This maps one authoritative, persistent real-time object to each duel, fits the existing room architecture, supports WebSockets and has a suitable free allowance for family use. The trade-off is a second deployment platform and a Worker-specific server implementation.

## Experience and visual direction

- Retain and elevate the existing Ivory Kingdom versus Sun Empire foundation for the first release; a full lore/art replacement is deferred because it is not required to prove the product.
- Rename and reframe the experience as **Requiem of Kings** without removing required upstream MIT attribution.
- Tone: dark, operatic and dramatic, but broadly accessible—stylised combat, no graphic gore, no age gate and no public social features.
- The 3D battle remains the default on all supported devices.
- Device adaptation may reduce pixel ratio, shadows, particles, post-processing, environment detail, audio layers and model detail, but must preserve animated pieces, attacks, deaths, spells and readable chess state.
- Tactical/overhead view remains an optional aid, not a mobile downgrade.
- Touch targets, camera controls, promotion, settings and link sharing must be purpose-designed for small screens.
- Reduced-motion mode keeps move comprehension while removing camera shake, aggressive zooms and non-essential particles.
- The board must remain legible during every animation and return input only when the canonical state and scene agree.

## Quality budgets

Initial budgets are release gates, not promises about the current build:

- Supported baseline: current Chrome, Edge, Safari and Firefox; iOS Safari and Android Chrome on devices capable of WebGL2.
- First useful interaction on a typical home broadband connection: target under 5 seconds on desktop and under 8 seconds on a representative mid-range phone, measured from a cold cache.
- Initial transfer for the playable board: target under 15 MB; non-critical battleground, animation and audio assets load afterwards.
- Maintain 30 FPS or better during ordinary board interaction on the agreed representative mid-range phone; capture cinematics may dip briefly but must not freeze input indefinitely or crash.
- Multiplayer accepted-move state should normally reach both clients within 500 ms on a stable UK broadband/4G connection, excluding the local cinematic animation duration.
- A dropped connection must visibly enter recovery within 3 seconds and automatically resynchronise when connectivity returns.
- No legal move may be lost, duplicated or applied twice across refresh, reconnect or retry.
- Secrets must not appear in client or service logs during automated tests.

Representative devices will be selected from hardware actually available to the owner before final performance acceptance.

## Accessibility and safety

- Keyboard-operable menus and chess interaction where practical, with visible focus.
- Screen-reader labels for controls, square selection, move results, check and game result.
- Sufficient contrast independent of bloom, faction colour or particle effects.
- Captions/text equivalents for important audio-only feedback.
- Reduced motion, master volume and effect/music controls.
- No chat, public discovery, tracking advertising or behavioural profiling.
- Optional aliases must be escaped and length-limited everywhere they render.
- A privacy note explains that private match state and optional aliases are stored for the stated retention period.

## Delivery stages and gates

### Stage 0 — Baseline and decision record

Document the verified repository state, licence, dependency risks, current tests, supported browsers, selected hosting architecture and secrets model.

**Gate:** Baseline can be reproduced from a clean checkout; owner approves this design.

### Stage 1 — Durable multiplayer vertical slice

Port one authoritative room to a Cloudflare Durable Object, create/join using distinct secrets, validate moves, persist state and resume each seat from a private link. Use the existing visual client with minimal cosmetic change.

**Gate:** Two real browsers on different networks can start, make moves, close, reopen on different devices and recover the same position after the service has hibernated/restarted.

### Stage 2 — Complete online match lifecycle

Add clocks, disconnect recovery, expiry, resignation, all draw/checkmate outcomes, rematch, token rotation, error states and deployment-origin security. Add protocol contract and adversarial multiplayer tests.

**Gate:** A full remote game and every terminal/recovery path pass without divergent client state or leaked credentials.

### Stage 3 — Cross-device 3D reliability

Profile the current scene and asset graph; compress and stage assets; add level-of-detail and adaptive effects; fix touch/camera interactions; make scene recovery robust to WebGL loss and suspended tabs.

**Gate:** Representative phone, tablet and PC complete an online match within the quality budgets while retaining the 3D battle experience.

### Stage 4 — Requiem identity and premium experience

Apply the final name, focused dark-fantasy art direction, coherent menu/lobby/HUD, refined combat timing, sound mix, loading sequence and share/return-link experience. Replace weak or unlicensed production assets only after an asset provenance audit.

**Gate:** A first-time player can create, share, join, play and return without explanation; art and audio pass a documented consistency and provenance review.

### Stage 5 — Assurance and release candidate

Complete accessibility review, security abuse cases, browser/device matrix, performance regression checks, dependency remediation, monitoring, privacy copy, deployment automation and rollback instructions.

**Gate:** No open blocker/high-severity defect; release checklist has current evidence for tests, build, deployment, persistence and rollback.

### Stage 6 — Family beta and initial release

Release privately to the owner, son and invited friends. Observe connection failures, loading times, confusing interactions and device-specific defects. Fix release blockers before widening sharing.

**Gate:** Invited players can independently complete and resume matches; the owner accepts documented remaining limitations.

### Stage 7 — Evidence-led enhancement

Prioritise improvements from beta evidence. Candidate work includes deeper lore, new armies or arenas, spectator mode, replays and stronger presentation, but none enters scope automatically.

## Release acceptance criteria

The initial release is acceptable only when:

1. The Vercel URL loads a playable 3D game on the agreed browser/device matrix.
2. A host can create a private match and share a one-time join link.
3. Exactly one opponent can claim the second seat.
4. Each player can recover their own seat on a different device using their private return link.
5. Match state survives both clients disconnecting and the room hibernating.
6. The authoritative service rejects invalid, out-of-turn, replayed and wrong-seat moves.
7. Refresh, retry and reconnect cannot duplicate a move.
8. Checkmate, draw, timeout, resignation and rematch remain synchronised.
9. A weak or disconnected network produces understandable recovery rather than a frozen board.
10. The essential 3D battle experience remains present on supported phones.
11. Private tokens are absent from telemetry, logs, referrers and rendered metadata.
12. The MIT licence remains present and asset provenance is documented.
13. Automated tests, production builds and deployment smoke tests pass from a clean checkout.
14. Rollback and service-recovery instructions have been exercised.

## Principal risks

- **Mobile asset weight and GPU limits:** mitigate with profiling, compression, staged loading, LOD and adaptive effects without removing 3D combat.
- **Secret links forwarded or exposed:** mitigate with high-entropy tokens, hashing, one-time claim, token rotation, redaction and clear UI warnings.
- **Client/service rules drift:** mitigate with shared contracts, version handshakes and contract tests.
- **Free-tier policy or quota changes:** isolate provider-specific code, monitor limits and document a migration path.
- **Cloudflare learning and deployment complexity:** deliver the smallest room vertical slice before broader polish.
- **Unverified asset rights or remote asset availability:** complete provenance audit and self-host/compress approved production assets.
- **Visual ambition causing endless scope:** enforce stage gates and accept no art expansion before reliable cross-device play.
- **No formal service SLA on free plans:** present this honestly as a family/hobby release and keep export/recovery options.

## Decisions recorded

- **APPROVED:** Free link-shareable browser game hosted visibly on Vercel.
- **APPROVED:** Private two-player matches, with separate matches created for other pairs.
- **APPROVED:** Persistent cross-device return links without accounts.
- **APPROVED:** Full 3D battle experience on PC, phone and tablet.
- **APPROVED:** Vercel presentation plus Cloudflare Durable Objects multiplayer architecture.
- **APPROVED:** No age gate.
- **RECOMMENDED:** Broad-audience stylised violence, no gore and no public social features.
- **RECOMMENDED:** Retain and elevate the two current civilisations for the initial release.
- **RECOMMENDED:** 90-day unfinished-match and 30-day completed-match retention.
- **RECOMMENDED:** Untimed online play by default; optional 5/10/15-minute live games continue through disconnects.
- **RECOMMENDED:** Rematches swap colours while retaining private seat identities.
- **RECOMMENDED:** The newest connection holding a seat link controls that seat; the previous connection is closed clearly.
- **DEFERRED:** Public matchmaking, chat, spectator mode, native apps and monetisation.

## Builder discretion

The implementation planner may choose exact Cloudflare project layout, schema encoding, test framework extensions, asset compression tools, observability provider and representative device list, provided the choices satisfy this design and do not create paid dependencies without owner approval.

The asset audit is authorised as read-only discovery. Assets without adequate production rights must not ship. Free replacements with compatible, documented rights may be proposed in a later art plan; paid acquisition, commissioned art or a material civilisation redesign requires a separate owner decision before expenditure or replacement work.

## Approval gate

No product implementation begins from this document until the owner approves it. After approval, create staged implementation plans, beginning with Stage 0 and the Stage 1 durable multiplayer vertical slice rather than one monolithic whole-project plan.
