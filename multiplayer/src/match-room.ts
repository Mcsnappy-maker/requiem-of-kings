import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";

export class MatchRoom extends DurableObject<Env> {
  async fetch(_request: Request): Promise<Response> {
    return Response.json({ error: "not-implemented" }, { status: 501 });
  }
}
