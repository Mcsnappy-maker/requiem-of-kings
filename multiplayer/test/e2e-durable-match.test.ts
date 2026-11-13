import { env, exports } from "cloudflare:workers";
import { evictDurableObject } from "cloudflare:test";
import { afterEach, expect, it } from "vitest";
import type { CreateMatchResponse, ErrorMessage, MoveRequest, SeatedMessage, StateMessage } from "../src/protocol";

type Message = ErrorMessage | SeatedMessage | StateMessage;
const origin = "http://localhost:8080";
const sockets: WebSocket[] = [];
afterEach(() => {
  for (const socket of sockets.splice(0)) {
    if (socket.readyState === WebSocket.OPEN) socket.close(1000);
  }
});

// All traffic crosses the actual Worker fetch handler and runtime WebSocketPair.
// The only test control is eviction; no storage seeding or protocol mocks.
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
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.removeEventListener("message", receive);
      reject(new Error("Timed out waiting for a match response"));
    }, 3000);
    function receive(event: MessageEvent) {
      clearTimeout(timer);
      try { resolve(JSON.parse(event.data as string) as Message); }
      catch { reject(new Error("Match response was not JSON")); }
    }
    socket.addEventListener("message", receive, { once: true });
  });
}

function send(socket: WebSocket, message: unknown): Promise<Message> {
  const response = next(socket);
  socket.send(JSON.stringify(message));
  return response;
}

function closed(socket: WebSocket): Promise<CloseEvent> {
  return new Promise((resolve) => socket.addEventListener("close", resolve, { once: true }));
}

function move(requestId: string, expectedVersion: number, from: string, to: string): MoveRequest {
  return { t: "move", v: 2, requestId, expectedVersion, from, to, promotion: null };
}

it("restores a two-player match after eviction, deduplicates a retry, replaces a seat and accepts the next legal move", async () => {
  const response = await exports.default.fetch("https://worker.test/api/matches", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ v: 2, name: "Host", color: "w" }),
  });
  expect(response.status).toBe(201);
  const match = await response.json() as CreateMatchResponse;
  expect(match.state).toMatchObject({ status: "waiting", stateVersion: 0, moves: [] });

  const host = await connect(match.matchId);
  expect(await send(host, { t: "resume", v: 2, token: match.hostToken })).toEqual({
    t: "seated", seat: "host", color: "w", state: match.state,
  });
  const guest = await connect(match.matchId);
  const joined = next(host);
  const claim = await send(guest, { t: "claim", v: 2, token: match.joinToken, name: "Guest" });
  expect(claim).toMatchObject({ t: "seated", seat: "guest", color: "b", state: { status: "active", stateVersion: 1 } });
  if (claim.t !== "seated") throw new Error("Guest was not seated");
  expect(claim.seatToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(await joined).toEqual({ t: "state", state: claim.state });

  const third = await connect(match.matchId);
  const thirdClosed = closed(third);
  expect(await send(third, { t: "claim", v: 2, token: match.joinToken, name: "Third" })).toEqual({
    t: "error", code: "join-consumed", fatal: true,
  });
  expect((await thirdClosed).code).toBe(1008);

  const lastMove = move("host-knight", 3, "g1", "f3");
  const plies = [
    { actor: host, peer: guest, request: move("host-pawn", 1, "e2", "e4"), san: "e4" },
    { actor: guest, peer: host, request: move("guest-pawn", 2, "e7", "e5"), san: "e5" },
    { actor: host, peer: guest, request: lastMove, san: "Nf3" },
  ];
  for (const [index, ply] of plies.entries()) {
    const broadcast = next(ply.peer);
    const result = await send(ply.actor, ply.request);
    expect(result).toMatchObject({ t: "state", state: { stateVersion: index + 2 } });
    if (result.t !== "state") throw new Error("Move was not accepted");
    expect(result.state.moves).toHaveLength(index + 1);
    expect(result.state.moves[index]).toMatchObject({ ply: index + 1, san: ply.san });
    expect(await broadcast).toEqual(result);
  }

  const originalConnectionsClosed = Promise.all([closed(host), closed(guest)]);
  host.close(1000);
  guest.close(1000);
  await originalConnectionsClosed;
  const room = env.MATCHES.get(env.MATCHES.idFromName(match.matchId));
  // Tears down the running instance, preserving its real durable storage.
  await evictDurableObject(room);

  const resumedHost = await connect(match.matchId);
  const resumedGuest = await connect(match.matchId);
  const hostSeat = await send(resumedHost, { t: "resume", v: 2, token: match.hostToken });
  const guestSeat = await send(resumedGuest, { t: "resume", v: 2, token: claim.seatToken });
  expect(hostSeat).toMatchObject({ t: "seated", seat: "host", color: "w" });
  expect(guestSeat).toMatchObject({ t: "seated", seat: "guest", color: "b" });
  if (hostSeat.t !== "seated" || guestSeat.t !== "seated") throw new Error("Seats did not resume");
  expect(hostSeat.state).toEqual(guestSeat.state);
  expect(hostSeat.state).toMatchObject({
    matchId: match.matchId, status: "active", stateVersion: 4, turn: "b",
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
    moves: [
      { ply: 1, from: "e2", to: "e4", san: "e4" },
      { ply: 2, from: "e7", to: "e5", san: "e5" },
      { ply: 3, from: "g1", to: "f3", san: "Nf3" },
    ],
  });
  expect(hostSeat.state.moves).toHaveLength(3);
  expect(await send(resumedHost, lastMove)).toEqual({ t: "state", state: hostSeat.state });

  // Also exercise hibernating live sockets before same-seat takeover.
  await evictDurableObject(room);
  const replacement = await connect(match.matchId);
  const replaced = next(resumedHost);
  const replacedClosed = closed(resumedHost);
  expect(await send(replacement, { t: "resume", v: 2, token: match.hostToken })).toEqual(hostSeat);
  expect(await replaced).toEqual({ t: "error", code: "seat-replaced", fatal: true });
  expect((await replacedClosed).code).toBe(1008);

  const replacementUpdate = next(replacement);
  const final = await send(resumedGuest, move("guest-knight-after-resume", 4, "b8", "c6"));
  expect(final).toMatchObject({ t: "state", state: {
    stateVersion: 5, turn: "w",
    fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
  } });
  if (final.t !== "state") throw new Error("Post-resume move was not accepted");
  expect(final.state.moves).toHaveLength(4);
  expect(final.state.moves.slice(0, 3)).toEqual(hostSeat.state.moves);
  expect(final.state.moves[3]).toMatchObject({ ply: 4, color: "b", from: "b8", to: "c6", san: "Nc6" });
  expect(await replacementUpdate).toEqual(final);
}, 15000);
