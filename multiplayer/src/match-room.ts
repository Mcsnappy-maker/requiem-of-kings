import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import { claimGuest, createMatch, resumeSeat, toWireState, type CreateMatchInput, type MatchRecord } from "./match-state";
import { PROTOCOL_VERSION, type AuthenticationError, type ErrorMessage, type SeatId, type SeatedMessage, type StateMessage } from "./protocol";
import { createSecret, hashSecret } from "./secrets";

interface SeatAttachment {
  seat: SeatId;
  tokenHash: string;
}

export class MatchRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const { pathname, search } = new URL(request.url);
    if (request.method === "POST" && pathname === "/internal/create") {
      const input = await request.json<CreateMatchInput>();
      return this.ctx.blockConcurrencyWhile(async () => {
        if (await this.ctx.storage.get("match")) return Response.json({ error: "match-exists" }, { status: 409 });
        const record = createMatch(input);
        await this.ctx.storage.put("match", record);
        return Response.json(toWireState(record), { status: 201 });
      });
    }
    if (request.method === "GET" && pathname === "/ws") {
      if (search) return Response.json({ error: "bad-message" }, { status: 400 });
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return Response.json({ error: "websocket-required" }, { status: 426 });
      if (!await this.ctx.storage.get("match")) return Response.json({ error: "no-match" }, { status: 404 });
      const { 0: client, 1: server } = new WebSocketPair();
      // Cloudflare must accept before the first frame can arrive. A null attachment
      // has no seat identity and is excluded from all public-state broadcasts.
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    return Response.json({ error: "not-found" }, { status: 404 });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Serialize authentication, including hashing and the storage write: two claims
    // must never both observe an unused invitation across an async boundary.
    await this.ctx.blockConcurrencyWhile(async () => {
      if (socket.readyState !== WebSocket.OPEN) return;
      if (socket.deserializeAttachment()) return this.fatal(socket, "bad-message");
      let body: Record<string, unknown>;
      try {
        if (typeof message !== "string") throw new Error();
        const parsed: unknown = JSON.parse(message);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
        body = parsed as Record<string, unknown>;
      } catch {
        return this.fatal(socket, "bad-message");
      }
      if (body.v !== PROTOCOL_VERSION) return this.fatal(socket, "bad-version");
      if (body.t !== "resume" && body.t !== "claim") return this.fatal(socket, "not-seated");
      if (typeof body.token !== "string" || !body.token || (body.t === "claim" && typeof body.name !== "string")
        || Object.keys(body).length !== (body.t === "claim" ? 4 : 3)) return this.fatal(socket, "bad-message");

      const record = await this.ctx.storage.get<MatchRecord>("match");
      if (!record) return this.fatal(socket, "no-match");
      const presentedHash = await hashSecret(body.token);
      if (body.t === "resume") {
        const seat = resumeSeat(record, presentedHash);
        if (!seat) return this.fatal(socket, "bad-token");
        this.seat(socket, record, { seat, tokenHash: presentedHash });
        return;
      }
      const seatToken = createSecret();
      const tokenHash = await hashSecret(seatToken);
      const result = claimGuest(record, presentedHash, tokenHash, body.name as string);
      if (!result.ok) return this.fatal(socket, result.error);
      await this.ctx.storage.put("match", result.record);
      this.seat(socket, result.record, { seat: "guest", tokenHash }, seatToken);
      const update: StateMessage = { t: "state", state: toWireState(result.record) };
      for (const peer of this.ctx.getWebSockets()) {
        if (peer !== socket && peer.readyState === WebSocket.OPEN && peer.deserializeAttachment()) peer.send(JSON.stringify(update));
      }
    });
  }

  private seat(socket: WebSocket, record: MatchRecord, attachment: SeatAttachment, seatToken?: string): void {
    socket.serializeAttachment(attachment);
    const message: SeatedMessage = {
      t: "seated", seat: attachment.seat, color: record[attachment.seat]!.color, state: toWireState(record),
      ...(seatToken ? { seatToken } : {}),
    };
    socket.send(JSON.stringify(message));
  }

  private fatal(socket: WebSocket, code: AuthenticationError): void {
    socket.send(JSON.stringify({ t: "error", code, fatal: true } satisfies ErrorMessage));
    socket.close(1008, code);
  }

  webSocketClose(socket: WebSocket, code: number): void {
    socket.close([1005, 1006, 1015].includes(code) ? 1000 : code);
  }
}
