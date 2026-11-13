import { Chess } from "chess.js";
import { PROTOCOL_VERSION, type MatchStatus, type MoveRequest, type SeatId, type WireColor, type WireGameState, type WireMove, type WireResult } from "./protocol";

export type { MatchStatus, MoveRequest, SeatId, WireColor, WireGameState, WireMove, WireResult } from "./protocol";

export interface StoredSeat {
  color: WireColor;
  tokenHash: string;
  name: string;
}

export interface MatchRecord {
  schemaVersion: 1;
  protocolVersion: 2;
  matchId: string;
  status: MatchStatus;
  fen: string;
  moves: WireMove[];
  stateVersion: number;
  host: StoredSeat;
  guest: StoredSeat | null;
  joinTokenHash: string | null;
  createdAt: number;
  updatedAt: number;
  result: WireResult | null;
  recentRequests: Array<{ requestId: string; outcomeVersion: number }>;
}

/** The HTTP layer resolves a random colour preference before creation. */
export interface CreateMatchInput {
  matchId: string;
  hostTokenHash: string;
  joinTokenHash: string;
  color: WireColor;
  name: string;
  now: number;
}

export type ClaimOutcome =
  | { ok: true; record: MatchRecord; seat: "guest" }
  | { ok: false; error: "bad-token" | "join-consumed" | "match-expired" };

export type MoveOutcome =
  | { ok: true; record: MatchRecord; duplicate: boolean; outcomeVersion: number }
  | { ok: false; error: "bad-version" | "bad-message" | "not-seated" | "not-active" | "game-over" | "match-expired" | "state-version-mismatch" | "not-your-turn" | "illegal-move" };

function sanitiseName(name: string): string {
  const printable = name.replace(/[\p{C}\p{Zl}\p{Zp}]/gu, "").trim();
  return Array.from(printable).slice(0, 20).join("").trim() || "Challenger";
}

export function createMatch(input: CreateMatchInput): MatchRecord {
  return {
    schemaVersion: 1,
    protocolVersion: PROTOCOL_VERSION,
    matchId: input.matchId,
    status: "waiting",
    fen: new Chess().fen(),
    moves: [],
    stateVersion: 0,
    host: { color: input.color, tokenHash: input.hostTokenHash, name: sanitiseName(input.name) },
    guest: null,
    joinTokenHash: input.joinTokenHash,
    createdAt: input.now,
    updatedAt: input.now,
    result: null,
    recentRequests: [],
  };
}

/** Verify the one-time invite and install a different, freshly generated seat hash. */
export function claimGuest(record: MatchRecord, presentedJoinTokenHash: string, guestTokenHash: string, name: string): ClaimOutcome {
  if (record.status === "expired") return { ok: false, error: "match-expired" };
  if (record.status !== "waiting" || record.guest || record.joinTokenHash === null) return { ok: false, error: "join-consumed" };
  if (presentedJoinTokenHash !== record.joinTokenHash || guestTokenHash === record.joinTokenHash || guestTokenHash === record.host.tokenHash) {
    return { ok: false, error: "bad-token" };
  }
  return {
    ok: true,
    seat: "guest",
    record: {
      ...record,
      status: "active",
      guest: { color: record.host.color === "w" ? "b" : "w", tokenHash: guestTokenHash, name: sanitiseName(name) },
      joinTokenHash: null,
      stateVersion: record.stateVersion + 1,
      updatedAt: Math.max(record.updatedAt, Date.now()),
    },
  };
}

export function resumeSeat(record: MatchRecord, tokenHash: string): SeatId | null {
  if (record.host.tokenHash === tokenHash) return "host";
  if (record.guest?.tokenHash === tokenHash) return "guest";
  return null;
}

function validMoveRequest(request: MoveRequest): boolean {
  return request.t === "move" && typeof request.requestId === "string" && request.requestId.trim().length > 0
    && Number.isSafeInteger(request.expectedVersion) && request.expectedVersion >= 0
    && typeof request.from === "string" && /^[a-h][1-8]$/.test(request.from)
    && typeof request.to === "string" && /^[a-h][1-8]$/.test(request.to)
    && (request.promotion === null || typeof request.promotion === "string" && /^[qrbn]$/.test(request.promotion));
}

function restoreChess(record: MatchRecord): Chess {
  // Replaying the ledger preserves repetition history that a FEN alone cannot hold.
  const chess = new Chess();
  for (const move of record.moves) {
    chess.move({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) });
  }
  if (chess.fen() !== record.fen) throw new Error("Stored move history does not match position");
  return chess;
}

function chessResult(chess: Chess): WireResult | null {
  if (chess.isCheckmate()) return { winner: chess.turn() === "w" ? "b" : "w", reason: "checkmate" };
  if (chess.isStalemate()) return { winner: null, reason: "stalemate" };
  if (chess.isThreefoldRepetition()) return { winner: null, reason: "threefold" };
  if (chess.isInsufficientMaterial()) return { winner: null, reason: "insufficient" };
  if (chess.isDrawByFiftyMoves()) return { winner: null, reason: "fiftymove" };
  return null;
}

export function applyMove(record: MatchRecord, seat: SeatId, request: MoveRequest): MoveOutcome {
  if (request.v !== PROTOCOL_VERSION) return { ok: false, error: "bad-version" };
  if (!validMoveRequest(request)) return { ok: false, error: "bad-message" };
  if (seat !== "host" && seat !== "guest" || !record[seat]) return { ok: false, error: "not-seated" };
  const previous = record.recentRequests.find((entry) => entry.requestId === request.requestId);
  if (previous) return { ok: true, record, duplicate: true, outcomeVersion: previous.outcomeVersion };
  if (record.status === "expired") return { ok: false, error: "match-expired" };
  if (record.status === "complete") return { ok: false, error: "game-over" };
  if (record.status !== "active") return { ok: false, error: "not-active" };
  if (request.expectedVersion !== record.stateVersion) return { ok: false, error: "state-version-mismatch" };

  const chess = restoreChess(record);
  if (record[seat]!.color !== chess.turn()) return { ok: false, error: "not-your-turn" };
  let played;
  try {
    played = chess.move({ from: request.from, to: request.to, ...(request.promotion ? { promotion: request.promotion } : {}) });
  } catch {
    return { ok: false, error: "illegal-move" };
  }
  const stateVersion = record.stateVersion + 1;
  const accepted: WireMove = {
    ply: record.moves.length + 1,
    color: played.color,
    from: played.from,
    to: played.to,
    promotion: (played.promotion ?? null) as WireMove["promotion"],
    san: played.san,
    fen: chess.fen(),
  };
  const result = chessResult(chess);
  return {
    ok: true,
    duplicate: false,
    outcomeVersion: stateVersion,
    record: {
      ...record,
      status: result ? "complete" : "active",
      result,
      fen: accepted.fen,
      moves: [...record.moves, accepted],
      stateVersion,
      updatedAt: Math.max(record.updatedAt, Date.now()),
      recentRequests: [...record.recentRequests, { requestId: request.requestId, outcomeVersion: stateVersion }].slice(-128),
    },
  };
}

export function toWireState(record: MatchRecord): WireGameState {
  const seats = record.guest ? [record.host, record.guest] : [record.host];
  return {
    matchId: record.matchId,
    status: record.status,
    fen: record.fen,
    moves: record.moves.map((move) => ({ ...move })),
    stateVersion: record.stateVersion,
    turn: new Chess(record.fen).turn(),
    started: record.guest !== null,
    over: record.status === "complete" || record.status === "expired",
    result: record.result ? { ...record.result } : null,
    players: seats.map(({ color, name }) => ({ color, name })),
  };
}
