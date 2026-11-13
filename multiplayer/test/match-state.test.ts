import { describe, expect, it } from "vitest";
import { applyMove, claimGuest, createMatch, resumeSeat, toWireState, type MatchRecord } from "../src/match-state";
import type { MoveRequest } from "../src/protocol";
import { createSecret, hashSecret } from "../src/secrets";

const HOST_HASH = "a".repeat(64);
const JOIN_HASH = "b".repeat(64);
const GUEST_HASH = "c".repeat(64);
const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const E4_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

function waiting(color: "w" | "b" = "w", name = "Host"): MatchRecord {
  return createMatch({ matchId: "match-example", hostTokenHash: HOST_HASH, joinTokenHash: JOIN_HASH, color, name, now: 1000 });
}

function active(color: "w" | "b" = "w"): MatchRecord {
  const outcome = claimGuest(waiting(color), JOIN_HASH, GUEST_HASH, "Guest");
  if (!outcome.ok) throw new Error("Fixture claim failed");
  return outcome.record;
}

function move(requestId: string, expectedVersion: number, from = "e2", to = "e4"): MoveRequest {
  return { t: "move", v: 2, requestId, expectedVersion, from, to, promotion: null };
}

describe("match creation and seats", () => {
  it("creates an untimed waiting match with a serialisable authoritative record", () => {
    const record = waiting();
    expect(record).toEqual({
      schemaVersion: 1, protocolVersion: 2, matchId: "match-example", status: "waiting", fen: INITIAL_FEN,
      moves: [], stateVersion: 0, host: { color: "w", tokenHash: HOST_HASH, name: "Host" }, guest: null,
      joinTokenHash: JOIN_HASH, createdAt: 1000, updatedAt: 1000, result: null, recentRequests: [],
    });
    expect(JSON.parse(JSON.stringify(record))).toEqual(record);
  });

  it("honours black host preference and assigns white to the guest", () => {
    const record = active("b");
    expect(record.host.color).toBe("b");
    expect(record.guest?.color).toBe("w");
  });

  it("claims exactly once with a distinct guest seat hash and consumes the join hash", () => {
    const original = waiting();
    const outcome = claimGuest(original, JOIN_HASH, GUEST_HASH, " Guest ");
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.seat).toBe("guest");
    expect(outcome.record.status).toBe("active");
    expect(outcome.record.guest).toEqual({ color: "b", tokenHash: GUEST_HASH, name: "Guest" });
    expect(outcome.record.guest?.tokenHash === JOIN_HASH).toBe(false);
    expect(outcome.record.joinTokenHash).toBeNull();
    expect(outcome.record.stateVersion).toBe(1);
    expect(original.status).toBe("waiting");
    expect(original.joinTokenHash === JOIN_HASH).toBe(true);
    expect(claimGuest(outcome.record, JOIN_HASH, "d".repeat(64), "Replay")).toEqual({ ok: false, error: "join-consumed" });
  });

  it("rejects a wrong presented join hash without changing the record", () => {
    const record = waiting();
    const before = JSON.stringify(record);
    expect(claimGuest(record, HOST_HASH, GUEST_HASH, "Guest")).toEqual({ ok: false, error: "bad-token" });
    expect(JSON.stringify(record) === before).toBe(true);
  });

  it("refuses to reuse the join or host credential as the guest seat credential", () => {
    for (const hash of [JOIN_HASH, HOST_HASH]) {
      expect(claimGuest(waiting(), JOIN_HASH, hash, "Guest")).toEqual({ ok: false, error: "bad-token" });
    }
  });

  it("recovers only the correct seat by hash, never by the consumed join hash", () => {
    const record = active();
    expect(resumeSeat(record, HOST_HASH)).toBe("host");
    expect(resumeSeat(record, GUEST_HASH)).toBe("guest");
    expect(resumeSeat(record, JOIN_HASH)).toBeNull();
    expect(resumeSeat(record, "wrong")).toBeNull();
    expect(resumeSeat(waiting(), GUEST_HASH)).toBeNull();
  });

  it("strips non-printing characters, trims and limits names by Unicode code point", () => {
    expect(waiting("w", " \u0000Al\u007fice\u202e\n ").host.name).toBe("Alice");
    expect(waiting("w", " \n\u0000 ").host.name).toBe("Challenger");
    expect(waiting("w", "😀".repeat(21)).host.name).toBe("😀".repeat(20));
    const outcome = claimGuest(waiting(), JOIN_HASH, GUEST_HASH, "\u0000 ");
    if (!outcome.ok) throw new Error("Claim failed");
    expect(outcome.record.guest?.name).toBe("Challenger");
  });

  it("never exposes credential hashes or internal deduplication data in public state", async () => {
    const secret = createSecret();
    const hash = await hashSecret(secret);
    const record = createMatch({ matchId: "private", hostTokenHash: hash, joinTokenHash: JOIN_HASH, color: "w", name: "Host", now: 1000 });
    const wire = toWireState(record);
    expect(wire).toEqual({ matchId: "private", status: "waiting", fen: INITIAL_FEN, moves: [], stateVersion: 0, turn: "w", started: false, over: false, result: null, players: [{ color: "w", name: "Host" }] });
    const stored = JSON.stringify(record);
    const publicJson = JSON.stringify(wire);
    expect(stored.includes(secret)).toBe(false);
    expect(publicJson.includes(secret) || publicJson.includes(hash) || publicJson.includes(JOIN_HASH)).toBe(false);
    expect("recentRequests" in wire).toBe(false);
  });
});

describe("authoritative moves", () => {
  it("accepts legal e2-e4 and increments the version exactly once without mutating its input", () => {
    const record = active();
    const outcome = applyMove(record, "host", move("first", 1));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.duplicate).toBe(false);
    expect(outcome.outcomeVersion).toBe(2);
    expect(outcome.record.stateVersion).toBe(2);
    expect(outcome.record.fen).toBe(E4_FEN);
    expect(outcome.record.moves).toEqual([{ ply: 1, color: "w", from: "e2", to: "e4", promotion: null, san: "e4", fen: E4_FEN }]);
    expect(outcome.record.recentRequests).toEqual([{ requestId: "first", outcomeVersion: 2 }]);
    expect(record.moves).toHaveLength(0);
    expect(record.stateVersion).toBe(1);
    expect(toWireState(outcome.record).turn).toBe("b");
  });

  it("rejects wrong-turn, illegal and stale moves without changing any state", () => {
    const record = active();
    const before = JSON.stringify(record);
    expect(applyMove(record, "guest", move("wrong-turn", 1, "e7", "e5"))).toEqual({ ok: false, error: "not-your-turn" });
    expect(applyMove(record, "host", move("illegal", 1, "e2", "e5"))).toEqual({ ok: false, error: "illegal-move" });
    expect(applyMove(record, "host", move("stale", 0))).toEqual({ ok: false, error: "state-version-mismatch" });
    expect(JSON.stringify(record)).toBe(before);
    expect(record.recentRequests).toHaveLength(0);
  });

  it("deduplicates a successful request even after JSON reconstruction and later moves", () => {
    const first = applyMove(active(), "host", move("first", 1));
    if (!first.ok) throw new Error("First move failed");
    const restored: MatchRecord = JSON.parse(JSON.stringify(first.record));
    const second = applyMove(restored, "guest", move("second", 2, "e7", "e5"));
    if (!second.ok) throw new Error("Restored move failed");
    expect(second.record.moves.map((entry) => entry.san)).toEqual(["e4", "e5"]);
    expect(second.record.fen).toBe("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2");
    const repeated = applyMove(JSON.parse(JSON.stringify(second.record)), "host", move("first", 1));
    if (!repeated.ok) throw new Error("Retry failed");
    expect(repeated.duplicate).toBe(true);
    expect(repeated.outcomeVersion).toBe(2);
    expect(repeated.record).toEqual(second.record);
    expect(repeated.record.stateVersion).toBe(3);
    expect(repeated.record.moves).toHaveLength(2);
  });

  it("rejects moves before claim and after match completion or expiry", () => {
    expect(applyMove(waiting(), "host", move("waiting", 0))).toEqual({ ok: false, error: "not-active" });
    expect(applyMove({ ...active(), status: "complete" }, "host", move("complete", 1))).toEqual({ ok: false, error: "game-over" });
    expect(applyMove({ ...active(), status: "expired" }, "host", move("expired", 1))).toEqual({ ok: false, error: "match-expired" });
    expect(claimGuest({ ...waiting(), status: "expired" }, JOIN_HASH, GUEST_HASH, "Guest")).toEqual({ ok: false, error: "match-expired" });
  });

  it("rejects malformed move coordinates, promotion, version, or request identity safely", () => {
    const record = active();
    for (const request of [
      { ...move("bad", 1), from: "z9" }, { ...move("bad", 1), promotion: "king" },
      { ...move("bad", 1), requestId: "" }, { ...move("bad", 1), expectedVersion: NaN },
      { ...move("bad", 1), t: "unknown" },
    ]) {
      expect(applyMove(record, "host", request as MoveRequest)).toEqual({ ok: false, error: "bad-message" });
    }
    expect(applyMove(record, "host", { ...move("old", 1), v: 1 } as unknown as MoveRequest)).toEqual({ ok: false, error: "bad-version" });
    expect(applyMove(record, "unknown" as "host", move("bad-seat", 1))).toEqual({ ok: false, error: "not-seated" });
    expect(record.moves).toHaveLength(0);
  });

  it("persists only the last 128 successful request IDs, evicting the oldest", () => {
    const record = active();
    record.recentRequests = Array.from({ length: 128 }, (_, index) => ({ requestId: `previous-${index}`, outcomeVersion: index + 1 }));
    record.stateVersion = 129;
    const outcome = applyMove(record, "host", move("newest", 129));
    if (!outcome.ok) throw new Error("Move failed");
    expect(outcome.record.recentRequests).toHaveLength(128);
    expect(outcome.record.recentRequests[0]).toEqual({ requestId: "previous-1", outcomeVersion: 2 });
    expect(outcome.record.recentRequests.at(-1)).toEqual({ requestId: "newest", outcomeVersion: 130 });
    expect(record.recentRequests[0].requestId).toBe("previous-0");
  });

  it("returns independent public moves and players so consumers cannot change the record", () => {
    const outcome = applyMove(active(), "host", move("first", 1));
    if (!outcome.ok) throw new Error("Move failed");
    const wire = toWireState(outcome.record);
    wire.moves[0].san = "altered";
    wire.players[0].name = "altered";
    expect(outcome.record.moves[0].san).toBe("e4");
    expect(outcome.record.host.name).toBe("Host");
  });

  it("records the requested underpromotion as the canonical move", () => {
    let record = active();
    const plies = [["a2", "a4"], ["h7", "h5"], ["a4", "a5"], ["h5", "h4"], ["a5", "a6"], ["h4", "h3"], ["a6", "b7"], ["h3", "g2"], ["b7", "a8"]];
    for (const [index, [from, to]] of plies.entries()) {
      const request = move(`promotion-${index}`, record.stateVersion, from, to);
      if (index === 8) request.promotion = "n";
      const outcome = applyMove(record, index % 2 === 0 ? "host" : "guest", request);
      if (!outcome.ok) throw new Error(`Promotion move rejected: ${outcome.error}`);
      record = JSON.parse(JSON.stringify(outcome.record));
    }
    expect(record.moves.at(-1)?.promotion).toBe("n");
    expect(record.moves.at(-1)?.san).toBe("bxa8=N");
  });

  it("marks a legal checkmate complete and still recognises a retry of the finishing move", () => {
    let record = active();
    const plies = [["f2", "f3"], ["e7", "e5"], ["g2", "g4"], ["d8", "h4"]];
    for (const [index, [from, to]] of plies.entries()) {
      const outcome = applyMove(record, index % 2 === 0 ? "host" : "guest", move(`mate-${index}`, record.stateVersion, from, to));
      if (!outcome.ok) throw new Error(`Mating move rejected: ${outcome.error}`);
      record = JSON.parse(JSON.stringify(outcome.record));
    }
    expect(record.status).toBe("complete");
    expect(record.result).toEqual({ winner: "b", reason: "checkmate" });
    expect(toWireState(record).over).toBe(true);
    const retry = applyMove(record, "guest", move("mate-3", 4, "d8", "h4"));
    expect(retry.ok && retry.duplicate).toBe(true);
    expect(applyMove(record, "host", move("after-mate", 5, "a2", "a3"))).toEqual({ ok: false, error: "game-over" });
  });

  it("retains repetition history across JSON reconstruction", () => {
    let record = active();
    const cycle = [["g1", "f3"], ["g8", "f6"], ["f3", "g1"], ["f6", "g8"]];
    for (const [index, [from, to]] of [...cycle, ...cycle].entries()) {
      const outcome = applyMove(record, index % 2 === 0 ? "host" : "guest", move(`repetition-${index}`, record.stateVersion, from, to));
      if (!outcome.ok) throw new Error(`Repetition move rejected: ${outcome.error}`);
      record = JSON.parse(JSON.stringify(outcome.record));
    }
    expect(record.status).toBe("complete");
    expect(record.result).toEqual({ winner: null, reason: "threefold" });
  });
});
