# ADR 0001: Vercel presentation with Cloudflare Durable Objects multiplayer

- **Status:** Accepted
- **Date:** 13 November 2026
- **Decision owner:** Project owner

## Context

The browser chess game needs link-shareable matches whose canonical state survives disconnects, service restarts and players returning on another device. The existing Node relay keeps rooms in memory, so it cannot provide that durability on its own. The approved design calls for a static Vite client and one authoritative persistent room per match.

## Decision

Host the Vite production build and static assets on Vercel. Run the authoritative multiplayer API and WebSocket service in a Cloudflare Worker, routing each match to its own Durable Object for serialized state transitions and durable storage. Keep the browser as a presentation/client tier; it does not own canonical match state.

## Alternatives considered

- **Vercel only:** Rejected because WebSocket support is in public beta and connections are tied to a function's maximum duration without guaranteed affinity for later connections. Durable shared state would still require another service.
- **Vercel plus Supabase Realtime/Postgres:** Rejected because the authoritative room model would require a larger redesign, and free projects may pause after inactivity, which conflicts with the family return-link goal.

## Consequences

The product has two deployables and requires configuration for the public client origin and the multiplayer service origin, including approved production, preview and local development origins. Deployment and CI must account for both platforms. The Worker implementation is provider-specific, while the existing Node relay remains useful as a reference and test fixture. Durable Objects provide the match-level persistence and serialization boundary.
