import { corsHeaders, type Env } from "./env";

export { MatchRoom } from "./match-room";

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);
    const headers = corsHeaders(request, env);

    if (pathname.startsWith("/api/") && !headers.has("Access-Control-Allow-Origin")) {
      return Response.json({ error: "origin-not-allowed" }, { status: 403, headers });
    }

    if (request.method === "GET" && pathname === "/health") {
      return Response.json({ ok: true, protocol: 2, service: "requiem-multiplayer" }, { headers });
    }

    return Response.json({ error: "not-found" }, { status: 404, headers });
  },
} satisfies ExportedHandler<Env>;
