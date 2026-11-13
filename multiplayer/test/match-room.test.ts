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
    expect(attachments).toContainEqual({ seat: "host", tokenHash: await hashSecret(match.hostToken) });
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
