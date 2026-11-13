import { env, exports } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MatchRecord } from "../src/match-state";
import type { WireGameState } from "../src/protocol";
import { hashSecret } from "../src/secrets";

interface Created { matchId: string; hostToken: string; joinToken: string; state: WireGameState }
interface Message { t: string; seat?: string; seatToken?: string; state?: WireGameState; code?: string; fatal?: boolean }
const origin = "http://localhost:8080";
const sockets: WebSocket[] = [];
afterEach(() => { for (const socket of sockets.splice(0)) socket.close(); vi.restoreAllMocks(); });

async function create(): Promise<Created> {
  const response = await exports.default.fetch("https://worker.test/api/matches", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ v: 2, name: "Host", color: "w" }),
  });
  expect(response.status).toBe(201);
  return response.json() as Promise<Created>;
}

function room(matchId: string) { return env.MATCHES.get(env.MATCHES.idFromName(matchId)); }
async function stored(matchId: string) {
  return runInDurableObject(room(matchId), async (_instance, ctx) => (await ctx.storage.get<MatchRecord>("match"))!);
}
async function connect(matchId: string): Promise<WebSocket> {
  const response = await exports.default.fetch(`https://worker.test/api/matches/${matchId}/ws`, {
    headers: { Origin: origin, Upgrade: "websocket" },
  });
  expect(response.status).toBe(101);
  const socket = response.webSocket!;
  socket.accept();
  sockets.push(socket);
  return socket;
}
function next(socket: WebSocket): Promise<Message> {
  return new Promise((resolve) => socket.addEventListener("message", (event) => resolve(JSON.parse(event.data as string)), { once: true }));
}
function send(socket: WebSocket, message: unknown): Promise<Message> {
  const result = next(socket);
  socket.send(JSON.stringify(message));
  return result;
}

describe("durable match creation and authentication", () => {
  it("stores only credential hashes before creation returns and reloads the same public state", async () => {
    const match = await create();
    const record = await stored(match.matchId);
    expect(record.host.tokenHash).toBe(await hashSecret(match.hostToken));
    expect(record.joinTokenHash).toBe(await hashSecret(match.joinToken));
    expect(record.guest).toBeNull();
    expect(JSON.stringify(record)).not.toContain(match.hostToken);
    expect(JSON.stringify(record)).not.toContain(match.joinToken);
    await evictDurableObject(room(match.matchId));
    const socket = await connect(match.matchId);
    const seated = await send(socket, { t: "resume", v: 2, token: match.hostToken });
    expect(seated).toEqual({ t: "seated", seat: "host", color: "w", state: match.state });
    expect(JSON.stringify(seated)).not.toContain(match.hostToken);
    expect(JSON.stringify(seated)).not.toContain(match.joinToken);
  });

  it("claims once, persists the new guest hash before acknowledging and broadcasts only public state", async () => {
    const match = await create();
    const host = await connect(match.matchId);
    await send(host, { t: "resume", v: 2, token: match.hostToken });
    const guest = await connect(match.matchId);
    const hostUpdate = next(host);
    const claimed = await send(guest, { t: "claim", v: 2, token: match.joinToken, name: "Guest" });
    expect(claimed).toMatchObject({ t: "seated", seat: "guest", color: "b", state: { status: "active", stateVersion: 1 } });
    expect(claimed.seatToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect([match.hostToken, match.joinToken]).not.toContain(claimed.seatToken);
    const record = await stored(match.matchId);
    expect(record.joinTokenHash).toBeNull();
    expect(record.guest?.tokenHash).toBe(await hashSecret(claimed.seatToken!));
    const update = await hostUpdate;
    expect(update).toEqual({ t: "state", state: claimed.state });
    for (const token of [match.hostToken, match.joinToken, claimed.seatToken!]) {
      expect(JSON.stringify(record)).not.toContain(token);
      expect(JSON.stringify(update)).not.toContain(token);
    }
    const replay = await connect(match.matchId);
    expect(await send(replay, { t: "claim", v: 2, token: match.joinToken, name: "Replay" })).toEqual({ t: "error", code: "join-consumed", fatal: true });
    await evictDurableObject(room(match.matchId));
    const resumed = await connect(match.matchId);
    expect(await send(resumed, { t: "resume", v: 2, token: claimed.seatToken })).toEqual({ t: "seated", seat: "guest", color: "b", state: claimed.state });
    expect(await stored(match.matchId)).toEqual(record);
  });

  it("serializes simultaneous claims so exactly one distinct guest credential wins", async () => {
    const match = await create();
    const first = await connect(match.matchId);
    const second = await connect(match.matchId);
    const results = await Promise.all([send(first, { t: "claim", v: 2, token: match.joinToken, name: "First" }), send(second, { t: "claim", v: 2, token: match.joinToken, name: "Second" })]);
    expect(results.map((result) => result.t).sort()).toEqual(["error", "seated"]);
    expect(results.find((result) => result.t === "error")).toEqual({ t: "error", code: "join-consumed", fatal: true });
    expect((await stored(match.matchId)).guest?.tokenHash).toBe(await hashSecret(results.find((result) => result.t === "seated")!.seatToken!));
  });

  it("recovers authenticated socket attachments after hibernation without admitting pending sockets to state broadcasts", async () => {
    const match = await create();
    const host = await connect(match.matchId);
    await send(host, { t: "resume", v: 2, token: match.hostToken });
    const pending = await connect(match.matchId);
    const received: Message[] = [];
    pending.addEventListener("message", (event) => { received.push(JSON.parse(event.data as string)); });
    const attachments = await runInDurableObject(room(match.matchId), (_instance, ctx) => ctx.getWebSockets().map((socket) => socket.deserializeAttachment()));
    expect(attachments).toContainEqual(expect.objectContaining({ seat: "host", tokenHash: await hashSecret(match.hostToken) }));
    expect(attachments.filter(Boolean)).toHaveLength(1);
    await evictDurableObject(room(match.matchId));
    const hostUpdate = next(host);
    const guest = await connect(match.matchId);
    await send(guest, { t: "claim", v: 2, token: match.joinToken, name: "Guest" });
    expect((await hostUpdate).state?.status).toBe("active");
    const rejected = next(pending);
    pending.send(JSON.stringify({ t: "move", v: 2, requestId: "unauth", expectedVersion: 1, from: "e2", to: "e4", promotion: null }));
    expect(await rejected).toEqual({ t: "error", code: "not-seated", fatal: true });
    expect(received).toEqual([{ t: "error", code: "not-seated", fatal: true }]);
    expect((await stored(match.matchId)).moves).toEqual([]);
  });

  it.each([
    [{ t: "resume", v: 1, token: "wrong" }, "bad-version"],
    [{ t: "resume", v: 2, token: "wrong" }, "bad-token"],
    [{ t: "claim", v: 2, token: "wrong", name: "Guest" }, "bad-token"],
    [{ t: "claim", v: 2, token: "wrong" }, "bad-message"],
    [{ t: "resume", v: 2, token: 42 }, "bad-message"],
    [null, "bad-message"],
  ])("closes invalid first-frame authentication %j", async (message, code) => {
    const match = await create();
    const before = await stored(match.matchId);
    const socket = await connect(match.matchId);
    const closed = new Promise<CloseEvent>((resolve) => socket.addEventListener("close", resolve, { once: true }));
    expect(await send(socket, message)).toEqual({ t: "error", code, fatal: true });
    expect((await closed).code).toBe(1008);
    expect(await stored(match.matchId)).toEqual(before);
  });

  it("never logs raw creation or authentication credentials", async () => {
    const spies = [vi.spyOn(console, "log"), vi.spyOn(console, "info"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
    const match = await create();
    const socket = await connect(match.matchId);
    await send(socket, { t: "resume", v: 2, token: match.hostToken });
    const logs = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    expect(logs).not.toContain(match.hostToken);
    expect(logs).not.toContain(match.joinToken);
  });

  it("does not overwrite an already persisted match", async () => {
    const match = await create();
    const before = await stored(match.matchId);
    const response = await room(match.matchId).fetch("https://match.test/internal/create", {
      method: "POST", body: JSON.stringify({ matchId: match.matchId, name: "Other", color: "b", hostTokenHash: await hashSecret("other-host"), joinTokenHash: await hashSecret("other-join"), now: Date.now() }),
    });
    expect(response.status).toBe(409);
    expect(await stored(match.matchId)).toEqual(before);
  });

  it.each([1005, 1006, 1015])("acknowledges reserved runtime close code %s with a valid normal close code", async (code) => {
    const match = await create();
    const socket = await connect(match.matchId);
    const closed = new Promise<CloseEvent>((resolve) => socket.addEventListener("close", resolve, { once: true }));
    // These reserved reporting codes cannot themselves be sent on the wire.
    await runInDurableObject(room(match.matchId), (instance, ctx) => {
      instance.webSocketClose(ctx.getWebSockets()[0], code);
    });
    expect((await closed).code).toBe(1000);
  });

  it("does not allow another credential frame after a fatal first frame", async () => {
    const match = await create();
    const socket = await connect(match.matchId);
    const closed = new Promise<CloseEvent>((resolve) => socket.addEventListener("close", resolve, { once: true }));
    await runInDurableObject(room(match.matchId), async (instance, ctx) => {
      const server = ctx.getWebSockets()[0];
      await instance.webSocketMessage(server, JSON.stringify({ t: "claim", v: 2, token: "wrong", name: "Guest" }));
      await instance.webSocketMessage(server, JSON.stringify({ t: "claim", v: 2, token: match.joinToken, name: "Guest" }));
    });
    await closed;
    expect((await stored(match.matchId)).guest).toBeNull();
    expect((await stored(match.matchId)).status).toBe("waiting");
  });
});

const move = (overrides: Record<string, unknown> = {}) => ({
  t: "move", v: 2, requestId: "host-1", expectedVersion: 1, from: "e2", to: "e4", promotion: null, ...overrides,
});

async function activeMatch() {
  const match = await create();
  const host = await connect(match.matchId);
  await send(host, { t: "resume", v: 2, token: match.hostToken });
  const guest = await connect(match.matchId);
  const update = next(host);
  const claimed = await send(guest, { t: "claim", v: 2, token: match.joinToken, name: "Guest" });
  await update;
  return { ...match, host, guest, guestToken: claimed.seatToken!, state: claimed.state! };
}

describe("authoritative moves and socket recovery", () => {
  it("persists a legal move before broadcasting the same public state to both seats", async () => {
    const match = await activeMatch();
    const update = next(match.guest);
    const result = await send(match.host, move());
    expect(result).toMatchObject({ t: "state", state: { stateVersion: 2, turn: "b", moves: [{ san: "e4", from: "e2", to: "e4" }] } });
    expect(await update).toEqual(result);
    const record = await stored(match.matchId);
    expect(record.fen).toBe(result.state!.fen);
    expect(record.stateVersion).toBe(2);
    for (const token of [match.hostToken, match.joinToken, match.guestToken, record.host.tokenHash, record.guest!.tokenHash]) {
      expect(JSON.stringify(result)).not.toContain(token);
    }
  });

  it.each([
    ["guest", { from: "e7", to: "e5" }, "not-your-turn"],
    ["host", { to: "e5" }, "illegal-move"],
  ] as const)("rejects %s move with %s without changing storage", async (seat, changes, code) => {
    const match = await activeMatch();
    const before = await stored(match.matchId);
    expect(await send(match[seat], move(changes))).toEqual({ t: "error", code, fatal: false });
    expect(await stored(match.matchId)).toEqual(before);
  });

  it("returns canonical state with a stale-version error and leaves the match unchanged", async () => {
    const match = await activeMatch();
    const before = await stored(match.matchId);
    expect(await send(match.host, move({ expectedVersion: 0 }))).toEqual({
      t: "error", code: "state-version-mismatch", fatal: false, state: match.state,
    });
    expect(await stored(match.matchId)).toEqual(before);
  });

  it("returns canonical state for a duplicate request without replaying or rebroadcasting the move", async () => {
    const match = await activeMatch();
    const update = next(match.guest);
    const first = await send(match.host, move());
    expect(first.t).toBe("state");
    await update;
    const guestMessages: Message[] = [];
    match.guest.addEventListener("message", (event) => guestMessages.push(JSON.parse(event.data as string)));
    const before = await stored(match.matchId);
    expect(await send(match.host, move())).toEqual(first);
    expect(await stored(match.matchId)).toEqual(before);
    expect(guestMessages).toEqual([]);
  });

  it("reconstructs between moves, restores socket identities and keeps duplicate history", async () => {
    const match = await activeMatch();
    const guestUpdate = next(match.guest);
    expect((await send(match.host, move())).state?.stateVersion).toBe(2);
    await guestUpdate;
    await evictDurableObject(room(match.matchId));
    const hostUpdate = next(match.host);
    const second = await send(match.guest, move({ requestId: "guest-1", expectedVersion: 2, from: "e7", to: "e5" }));
    expect(second).toMatchObject({ t: "state", state: { stateVersion: 3, turn: "w", moves: [{ san: "e4" }, { san: "e5" }] } });
    expect(await hostUpdate).toEqual(second);
    expect(await send(match.host, move())).toEqual(second);
    expect((await stored(match.matchId)).moves).toHaveLength(2);
  });

  it("replaces the old same-seat socket after hibernation and closes it with a fatal seat-replaced error", async () => {
    const match = await activeMatch();
    await evictDurableObject(room(match.matchId));
    const replacement = await connect(match.matchId);
    const replaced = next(match.host);
    const closed = new Promise<CloseEvent>((resolve) => match.host.addEventListener("close", resolve, { once: true }));
    expect(await send(replacement, { t: "resume", v: 2, token: match.hostToken })).toMatchObject({ t: "seated", seat: "host" });
    expect(await replaced).toEqual({ t: "error", code: "seat-replaced", fatal: true });
    expect((await closed).code).toBe(1008);
    const guestUpdate = next(match.guest);
    expect((await send(replacement, move())).state?.stateVersion).toBe(2);
    expect((await guestUpdate).state?.stateVersion).toBe(2);
  });

  it("rejects a second authentication frame on an already seated socket", async () => {
    const match = await activeMatch();
    expect(await send(match.host, { t: "resume", v: 2, token: match.hostToken })).toEqual({ t: "error", code: "bad-message", fatal: true });
    expect((await stored(match.matchId)).moves).toEqual([]);
  });

  it("closes an errored socket without altering the match or reflecting the error", async () => {
    const match = await activeMatch();
    const before = await stored(match.matchId);
    const closed = new Promise<CloseEvent>((resolve) => match.host.addEventListener("close", resolve, { once: true }));
    await runInDurableObject(room(match.matchId), (instance, ctx) => {
      const host = ctx.getWebSockets().find((socket) => socket.deserializeAttachment()?.seat === "host")!;
      expect(typeof instance.webSocketError).toBe("function");
      instance.webSocketError(host, new Error(match.hostToken));
    });
    expect((await closed).reason).not.toContain(match.hostToken);
    expect(await stored(match.matchId)).toEqual(before);
  });

  it("does not broadcast a move when persistence fails, and reports only a fixed error", async () => {
    const match = await activeMatch();
    const before = await stored(match.matchId);
    const guestMessages: Message[] = [];
    match.guest.addEventListener("message", (event) => guestMessages.push(JSON.parse(event.data as string)));
    const response = next(match.host);
    await runInDurableObject(room(match.matchId), async (instance, ctx) => {
      const host = ctx.getWebSockets().find((socket) => socket.deserializeAttachment()?.seat === "host")!;
      const write = vi.spyOn(ctx.storage, "put").mockRejectedValueOnce(new Error(match.hostToken));
      try { await instance.webSocketMessage(host, JSON.stringify(move())); }
      finally { write.mockRestore(); }
    });
    expect(await response).toEqual({ t: "error", code: "server-error", fatal: true });
    expect(await stored(match.matchId)).toEqual(before);
    expect(guestMessages).toEqual([]);
  });
});

describe("internal creation boundary", () => {
  it.each([null, [], { name: "token-shaped-secret" }, { matchId: "bad", name: "Host", color: "w", hostTokenHash: "raw-token", joinTokenHash: "raw-token", now: 0 }])(
    "rejects invalid creation input without calling pure state or storing it", async (body) => {
      const stub = room(crypto.randomUUID());
      const response = await stub.fetch("https://match.internal/internal/create", { method: "POST", body: JSON.stringify(body) });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "bad-message" });
      expect(await runInDurableObject(stub, (_instance, ctx) => ctx.storage.get("match"))).toBeUndefined();
    },
  );
});

describe("hostile websocket input", () => {
  it.each([
    [move({ v: 1 }), "bad-version"],
    [move({ t: "unknown" }), "bad-message"],
    [move({ from: "a9" }), "bad-message"],
    [move({ to: 42 }), "bad-message"],
    [move({ promotion: "king" }), "bad-message"],
    [move({ promotion: undefined }), "bad-message"],
    [move({ requestId: " " }), "bad-message"],
    [move({ requestId: 42 }), "bad-message"],
    [move({ requestId: "x".repeat(129) }), "bad-message"],
    [move({ expectedVersion: -1 }), "bad-message"],
    [move({ expectedVersion: 1.5 }), "bad-message"],
    [move({ expectedVersion: "1" }), "bad-message"],
    [move({ expectedVersion: Number.MAX_SAFE_INTEGER + 1 }), "bad-message"],
    [move({ token: "sensitive-token-shaped-value" }), "bad-message"],
  ])("rejects malformed move %j before state mutation", async (message, code) => {
    const match = await activeMatch();
    const before = await stored(match.matchId);
    expect(await send(match.host, message)).toEqual({ t: "error", code, fatal: true });
    expect(await stored(match.matchId)).toEqual(before);
  });

  it.each([
    ["{\"token\":\"sensitive-token-shaped-value", "bad-message"],
    [new ArrayBuffer(8), "bad-message"],
    [JSON.stringify(move({ requestId: "x".repeat(65_536) })), "frame-too-large"],
    [JSON.stringify(move({ requestId: "£".repeat(32_768) })), "frame-too-large"],
    [new ArrayBuffer(65_537), "frame-too-large"],
  ])("rejects malformed or oversized raw frames without disclosing input", async (frame, code) => {
    const match = await activeMatch();
    const before = await stored(match.matchId);
    const response = next(match.host);
    match.host.send(frame);
    expect(await response).toEqual({ t: "error", code, fatal: true });
    expect(await stored(match.matchId)).toEqual(before);
  });

  it("limits each socket to 20 messages in a rolling second, retaining the count across hibernation", async () => {
    const match = await activeMatch();
    const before = await stored(match.matchId);
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    for (let i = 0; i < 20; i++) {
      expect(await send(match.host, move({ requestId: `stale-${i}`, expectedVersion: 0 }))).toMatchObject({ code: "state-version-mismatch", fatal: false });
      if (i === 9) await evictDurableObject(room(match.matchId));
    }
    expect(await send(match.host, move())).toEqual({ t: "error", code: "rate-limited", fatal: true });
    expect(await stored(match.matchId)).toEqual(before);
    expect(await send(match.guest, move({ from: "e7", to: "e5" }))).toEqual({ t: "error", code: "not-your-turn", fatal: false });
  });

  it("allows messages again after the rolling second elapses", async () => {
    const match = await activeMatch();
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    for (let i = 0; i < 20; i++) {
      expect((await send(match.host, move({ expectedVersion: 0 }))).code).toBe("state-version-mismatch");
    }
    clock.mockReturnValue(1_800_000_001_000);
    expect((await send(match.host, move())).state?.stateVersion).toBe(2);
  });

  it("never echoes or logs credentials supplied in invalid move fields", async () => {
    const spies = [vi.spyOn(console, "log"), vi.spyOn(console, "info"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
    const match = await activeMatch();
    const before = await stored(match.matchId);
    const result = await send(match.host, move({ from: match.hostToken }));
    expect(result).toEqual({ t: "error", code: "bad-message", fatal: true });
    expect(JSON.stringify(result)).not.toContain(match.hostToken);
    expect(JSON.stringify(spies.flatMap((spy) => spy.mock.calls))).not.toContain(match.hostToken);
    expect(await stored(match.matchId)).toEqual(before);
  });
});
