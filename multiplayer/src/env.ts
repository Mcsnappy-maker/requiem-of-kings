import type { MatchRoom } from "./match-room";

export interface Env {
  MATCHES: DurableObjectNamespace<MatchRoom>;
  ALLOWED_ORIGINS: string;
}

export function allowedOrigins(env: Env): ReadonlySet<string> {
  return new Set(env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean));
}

export function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers({ Vary: "Origin" });
  const origin = request.headers.get("Origin");
  if (origin !== null && allowedOrigins(env).has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}
