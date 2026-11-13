import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import { applyMove, claimGuest, createMatch, resumeSeat, toWireState, type CreateMatchInput, type MatchRecord } from "./match-state";
import { isMoveRequest, PROTOCOL_VERSION, type ErrorMessage, type ProtocolError, type SeatId, type SeatedMessage, type StateMessage } from "./protocol";
import { createSecret, hashSecret } from "./secrets";

interface SeatAttachment {
  seat: SeatId;
  tokenHash: string;
  /** Bounded sliding-window timestamps survive socket hibernation. */
  receivedAt?: number[];
}

const MAX_FRAME_BYTES = 64 * 1024;
const MAX_MESSAGES_PER_SECOND = 20;

function isCreateMatchInput(value: unknown): value is CreateMatchInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return Object.keys(body).length === 6
    && typeof body.matchId === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(body.matchId)
    && typeof body.hostTokenHash === "string" && /^[a-f0-9]{64}$/.test(body.hostTokenHash)
    && typeof body.joinTokenHash === "string" && /^[a-f0-9]{64}$/.test(body.joinTokenHash)
    && body.hostTokenHash !== body.joinTokenHash && typeof body.name === "string"
    && (body.color === "w" || body.color === "b")
    && typeof body.now === "number" && Number.isSafeInteger(body.now) && body.now >= 0;
}

export class MatchRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const { pathname, search } = new URL(request.url);
    if (request.method === "POST" && pathname === "/internal/create") {
      let input: unknown;
      try { input = await request.json(); }
      catch { return Response.json({ error: "bad-message" }, { status: 400 }); }
      if (!isCreateMatchInput(input)) return Response.json({ error: "bad-message" }, { status: 400 });
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
      // Pending sockets have no identity and cannot receive state broadcasts.
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    return Response.json({ error: "not-found" }, { status: 404 });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Serialize reads, hashing, writes and broadcasts across every async boundary.
    // No in-memory match cache: each event restores authoritative durable state.
    await this.ctx.blockConcurrencyWhile(async () => {
      if (socket.readyState !== WebSocket.OPEN) return;
      try {
        const attachment = this.attachment(socket);
        const now = Date.now();
        if (attachment) {
          const receivedAt = (attachment.receivedAt ?? []).filter((time) => time > now - 1000);
          if (receivedAt.length >= MAX_MESSAGES_PER_SECOND) return this.fatal(socket, "rate-limited");
          socket.serializeAttachment({ ...attachment, receivedAt: [...receivedAt, now] } satisfies SeatAttachment);
        }
        const bytes = typeof message === "string" ? new TextEncoder().encode(message).byteLength : message.byteLength;
        if (bytes > MAX_FRAME_BYTES) return this.fatal(socket, "frame-too-large");
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
        if (attachment) {
          if (!isMoveRequest(body)) return this.fatal(socket, "bad-message");
          const record = await this.ctx.storage.get<MatchRecord>("match");
          if (!record) return this.fatal(socket, "no-match");
          if (resumeSeat(record, attachment.tokenHash) !== attachment.seat) return this.fatal(socket, "not-seated");
          const result = applyMove(record, attachment.seat, body);
          if (!result.ok) {
            this.send(socket, {
              t: "error", code: result.error, fatal: false,
              ...(result.error === "state-version-mismatch" ? { state: toWireState(record) } : {}),
            });
            return;
          }
          if (result.duplicate) {
            // Retries are deduplicated within the last 128 accepted request IDs;
            // older unchanged retries are rejected by their stale expectedVersion.
            this.send(socket, { t: "state", state: toWireState(record) });
            return;
          }
          await this.ctx.storage.put("match", result.record);
          this.broadcast(result.record);
          return;
        }
        if (body.t !== "resume" && body.t !== "claim") return this.fatal(socket, "not-seated");
        if (typeof body.token !== "string" || !body.token || (body.t === "claim" && typeof body.name !== "string")
          || Object.keys(body).length !== (body.t === "claim" ? 4 : 3)) return this.fatal(socket, "bad-message");

        const record = await this.ctx.storage.get<MatchRecord>("match");
        if (!record) return this.fatal(socket, "no-match");
        const presentedHash = await hashSecret(body.token);
        if (body.t === "resume") {
          const seat = resumeSeat(record, presentedHash);
          if (!seat) return this.fatal(socket, "bad-token");
          this.seat(socket, record, { seat, tokenHash: presentedHash, receivedAt: [now] });
          return;
        }
        const seatToken = createSecret();
        const tokenHash = await hashSecret(seatToken);
        const result = claimGuest(record, presentedHash, tokenHash, body.name as string);
        if (!result.ok) return this.fatal(socket, result.error);
        await this.ctx.storage.put("match", result.record);
        this.seat(socket, result.record, { seat: "guest", tokenHash, receivedAt: [now] }, seatToken);
        this.broadcast(result.record, socket);
      } catch {
        // Runtime/storage exceptions can contain caller data. Never reflect or log them.
        this.fatal(socket, "server-error");
      }
    });
  }

  private attachment(socket: WebSocket): SeatAttachment | null {
    const value: unknown = socket.deserializeAttachment();
    if (!value || typeof value !== "object") return null;
    const candidate = value as Partial<SeatAttachment>;
    return (candidate.seat === "host" || candidate.seat === "guest") && typeof candidate.tokenHash === "string"
      ? candidate as SeatAttachment : null;
  }

  private seat(socket: WebSocket, record: MatchRecord, attachment: SeatAttachment, seatToken?: string): void {
    for (const peer of this.ctx.getWebSockets()) {
      if (peer !== socket && this.attachment(peer)?.seat === attachment.seat) {
        peer.serializeAttachment(null);
        this.fatal(peer, "seat-replaced");
      }
    }
    socket.serializeAttachment(attachment);
    this.send(socket, {
      t: "seated", seat: attachment.seat, color: record[attachment.seat]!.color, state: toWireState(record),
      ...(seatToken ? { seatToken } : {}),
    });
  }

  private broadcast(record: MatchRecord, except?: WebSocket): void {
    const update: StateMessage = { t: "state", state: toWireState(record) };
    for (const peer of this.ctx.getWebSockets()) {
      const attachment = this.attachment(peer);
      if (peer !== except && attachment && resumeSeat(record, attachment.tokenHash) === attachment.seat) this.send(peer, update);
    }
  }

  private send(socket: WebSocket, message: StateMessage | SeatedMessage | ErrorMessage): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    try {
      socket.send(JSON.stringify(message));
    } catch {
      this.webSocketError(socket);
    }
  }

  private fatal(socket: WebSocket, code: ProtocolError): void {
    this.send(socket, { t: "error", code, fatal: true });
    if (socket.readyState === WebSocket.OPEN) socket.close(1008, code);
  }

  webSocketClose(socket: WebSocket, code: number): void {
    socket.close([1005, 1006, 1015].includes(code) ? 1000 : code);
  }

  webSocketError(socket: WebSocket, _error?: unknown): void {
    socket.serializeAttachment(null);
    if (socket.readyState === WebSocket.OPEN) socket.close(1011, "server-error");
  }
}
