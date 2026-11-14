import { corsHeaders, type Env } from "./env";
import { PROTOCOL_VERSION, type CreateMatchResponse, type WireGameState } from "./protocol";
import { createSecret, hashSecret } from "./secrets";

export { MatchRoom } from "./match-room";

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const headers = corsHeaders(request, env);

    if (pathname.startsWith("/api/") && !headers.has("Access-Control-Allow-Origin")) {
      return Response.json({ error: "origin-not-allowed" }, { status: 403, headers });
    }

    if (request.method === "GET" && pathname === "/health") {
      return Response.json({ ok: true, protocol: 2, service: "requiem-multiplayer" }, { headers });
    }

    const localDevelopment = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)
      && /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(request.headers.get("Origin") ?? "");
    if (pathname.startsWith("/api/") && url.protocol !== "https:" && !localDevelopment) {
      return Response.json({ error: "https-required" }, { status: 400, headers });
    }

    const socketRoute = /^\/api\/matches\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\/ws$/.exec(pathname);
    if (pathname === "/api/matches" || socketRoute) {
      headers.set("Cache-Control", "no-store");
      if (url.search) return Response.json({ error: "bad-message" }, { status: 400, headers });
      if (request.method === "OPTIONS") {
        headers.set("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
        headers.set("Access-Control-Allow-Headers", "Content-Type");
        return new Response(null, { status: 204, headers });
      }
    }

    if (request.method === "POST" && pathname === "/api/matches") {
      // Cloudflare supplies this header at the edge. Do not trust caller-set
      // forwarding headers as an identity; local development remains unmetered.
      const clientKey = request.headers.get("CF-Connecting-IP");
      if (clientKey && env.MATCH_CREATE_LIMITER) {
        const { success } = await env.MATCH_CREATE_LIMITER.limit({ key: clientKey });
        if (!success) return Response.json({ error: "rate-limited" }, { status: 429, headers });
      }
      let body: Record<string, unknown>;
      try {
        const parsed: unknown = await request.json();
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
        body = parsed as Record<string, unknown>;
      } catch {
        return Response.json({ error: "bad-message" }, { status: 400, headers });
      }
      if (body.v !== PROTOCOL_VERSION) return Response.json({ error: "bad-version" }, { status: 400, headers });
      if (Object.keys(body).length !== 3 || typeof body.name !== "string" || !["w", "b", "random"].includes(body.color as string)) {
        return Response.json({ error: "bad-message" }, { status: 400, headers });
      }
      const matchId = crypto.randomUUID();
      const hostToken = createSecret();
      const joinToken = createSecret();
      const [hostTokenHash, joinTokenHash] = await Promise.all([hashSecret(hostToken), hashSecret(joinToken)]);
      const color = body.color === "random" ? (crypto.getRandomValues(new Uint8Array(1))[0] & 1 ? "w" : "b") : body.color;
      try {
        const room = env.MATCHES.get(env.MATCHES.idFromName(matchId));
        const created = await room.fetch("https://match.internal/internal/create", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId, hostTokenHash, joinTokenHash, name: body.name, color, now: Date.now() }),
        });
        if (!created.ok) return Response.json({ error: "server-error" }, { status: 500, headers });
        const state = await created.json() as WireGameState;
        return Response.json({ matchId, hostToken, joinToken, state } satisfies CreateMatchResponse, { status: 201, headers });
      } catch {
        return Response.json({ error: "server-error" }, { status: 500, headers });
      }
    }

    if (request.method === "GET" && socketRoute) {
      const room = env.MATCHES.get(env.MATCHES.idFromName(socketRoute[1]));
      const response = await room.fetch(new Request("https://match.internal/ws", request));
      const combined = new Headers(response.headers);
      headers.forEach((value, key) => combined.set(key, value));
      return new Response(response.body, { status: response.status, headers: combined, webSocket: response.webSocket });
    }

    return Response.json({ error: "not-found" }, { status: 404, headers });
  },
} satisfies ExportedHandler<Env>;
