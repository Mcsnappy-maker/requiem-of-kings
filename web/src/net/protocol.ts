/**
 * Protocol 2 mirrors the durable Worker's Stage 1 contract below.
 * OnlineClient and OnlineBridge use only the validated durable messages.
 * Room-code helpers remain solely for the old lobby until Task 8.
 */

export const PROTOCOL_VERSION = 2;

/** Room codes avoid vowels (no accidental words) and 0/O/1/I/L (misreads). */
export const ROOM_CODE_ALPHABET = "BCDFGHJKMNPQRSTVWXYZ23456789";
export const ROOM_CODE_LENGTH = 5;

/** A seat is held this long after a disconnect before the game is forfeited. */
export const RECONNECT_GRACE_MS = 60_000;

/** Client heartbeat period. The server evicts a socket after 2.5x this. */
export const HEARTBEAT_MS = 15_000;

/** An empty room is collected after this long with nobody connected. */
export const ROOM_IDLE_TTL_MS = 30 * 60_000;

export type WireColor = "w" | "b";

export type SeatPreference = "w" | "b" | "random";

// ------------------------------------------------------------------- helpers

/** Normalises user input: trims, uppercases, strips non-alphabet characters. */
export function normaliseRoomCode(raw: string): string {
  return raw
    .toUpperCase()
    .split("")
    .filter((char) => ROOM_CODE_ALPHABET.includes(char))
    .join("")
    .slice(0, ROOM_CODE_LENGTH);
}

export function isValidRoomCode(raw: string): boolean {
  if (typeof raw !== "string") return false;
  // Count the alphabet characters WITHOUT truncating. Validating the
  // truncated form would accept an over-length code and silently resolve
  // it to a different room than the user supplied.
  const kept = raw
    .toUpperCase()
    .split("")
    .filter((char) => ROOM_CODE_ALPHABET.includes(char));
  return kept.length === ROOM_CODE_LENGTH;
}

/**
 * Parses an inbound frame without trusting it. Returns null rather than
 * throwing, so a malformed or hostile payload can never kill the socket.
 */
export function parseMessage<T>(raw: string): T | null {
  if (typeof raw !== "string" || raw.length > 64_000) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    if (typeof (value as { t?: unknown }).t !== "string") return null;
    return value as T;
  } catch {
    return null;
  }
}

/** Square ids are exactly file+rank, e.g. "e4". Guards the server move path. */
export function isSquareId(value: unknown): value is string {
  return typeof value === "string" && /^[a-h][1-8]$/.test(value);
}

export function isPromotionPiece(value: unknown): value is string | null {
  return value === null || value === undefined || (typeof value === "string" && /^[qrbn]$/.test(value));
}

// ------------------------------------------------ durable Worker protocol 2

export type SeatId = "host" | "guest";
export type MatchStatus = "waiting" | "active" | "complete" | "expired";
export type PromotionPiece = "q" | "r" | "b" | "n";

export interface DurableMove {
  ply: number;
  color: WireColor;
  from: string;
  to: string;
  promotion: PromotionPiece | null;
  san: string;
  fen: string;
}

export interface DurableResult {
  winner: WireColor | null;
  reason: "checkmate" | "stalemate" | "threefold" | "insufficient" | "fiftymove" | "draw";
}

export interface DurablePlayer {
  color: WireColor;
  name: string;
}

/** Untimed Stage 1 state: no relay code, clocks, or connection flags. */
export interface DurableGameState {
  matchId: string;
  status: MatchStatus;
  fen: string;
  moves: DurableMove[];
  stateVersion: number;
  turn: WireColor;
  started: boolean;
  over: boolean;
  result: DurableResult | null;
  players: DurablePlayer[];
}

export interface CreateMatchRequest {
  v: 2;
  name: string;
  color: SeatPreference;
}

export interface CreateMatchResponse {
  matchId: string;
  hostToken: string;
  joinToken: string;
  state: DurableGameState;
}

export type AuthenticateRequest =
  | { t: "resume"; v: 2; token: string }
  | { t: "claim"; v: 2; token: string; name: string };

export interface MoveRequest {
  t: "move";
  v: 2;
  requestId: string;
  expectedVersion: number;
  from: string;
  to: string;
  promotion: PromotionPiece | null;
}

export interface SeatedMessage {
  t: "seated";
  seat: SeatId;
  color: WireColor;
  state: DurableGameState;
  /** Issued once after claiming a join link; absent on resume. */
  seatToken?: string;
}

export interface StateMessage {
  t: "state";
  state: DurableGameState;
}

export type AuthenticationError = "bad-message" | "bad-version" | "bad-token" | "not-seated"
  | "join-consumed" | "match-expired" | "no-match" | "server-error";

export type ProtocolError = AuthenticationError | "frame-too-large" | "rate-limited" | "seat-replaced"
  | "not-active" | "game-over" | "state-version-mismatch" | "not-your-turn" | "illegal-move";

export interface ErrorMessage {
  t: "error";
  code: ProtocolError;
  fatal: boolean;
  state?: DurableGameState;
}

export type DurableClientMessage = AuthenticateRequest | MoveRequest;
export type DurableServerMessage = SeatedMessage | StateMessage | ErrorMessage;

export function isMatchId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
}

/** Base64url credentials of at least 128 bits; Worker currently emits 32 bytes. */
export function isPrivateToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{22,128}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasKeys(value: Record<string, unknown>, required: string[], optional: string[] = []): boolean {
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key))
    && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}

function isColor(value: unknown): value is WireColor {
  return value === "w" || value === "b";
}

function isVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isDurableMove(value: unknown): value is DurableMove {
  return isRecord(value) && hasKeys(value, ["ply", "color", "from", "to", "promotion", "san", "fen"])
    && isVersion(value.ply) && value.ply > 0 && isColor(value.color) && isSquareId(value.from) && isSquareId(value.to)
    && (value.promotion === null || typeof value.promotion === "string" && /^[qrbn]$/.test(value.promotion))
    && typeof value.san === "string" && value.san.length > 0 && typeof value.fen === "string" && value.fen.length > 0;
}

function isDurableResult(value: unknown): value is DurableResult {
  return isRecord(value) && hasKeys(value, ["winner", "reason"])
    && (value.winner === null || isColor(value.winner))
    && ["checkmate", "stalemate", "threefold", "insufficient", "fiftymove", "draw"].includes(value.reason as string);
}

export function isDurableGameState(value: unknown): value is DurableGameState {
  return isRecord(value) && hasKeys(value, ["matchId", "status", "fen", "moves", "stateVersion", "turn", "started", "over", "result", "players"])
    && isMatchId(value.matchId) && ["waiting", "active", "complete", "expired"].includes(value.status as string)
    && typeof value.fen === "string" && value.fen.length > 0 && Array.isArray(value.moves) && value.moves.every(isDurableMove)
    && isVersion(value.stateVersion) && isColor(value.turn) && typeof value.started === "boolean" && typeof value.over === "boolean"
    && (value.result === null || isDurableResult(value.result))
    && Array.isArray(value.players) && value.players.length >= 1 && value.players.length <= 2
    && value.players.every((player) => isRecord(player) && hasKeys(player, ["color", "name"]) && isColor(player.color) && typeof player.name === "string");
}

export function isCreateMatchResponse(value: unknown): value is CreateMatchResponse {
  return isRecord(value) && hasKeys(value, ["matchId", "hostToken", "joinToken", "state"])
    && isMatchId(value.matchId) && isPrivateToken(value.hostToken) && isPrivateToken(value.joinToken)
    && value.hostToken !== value.joinToken && isDurableGameState(value.state) && value.state.matchId === value.matchId;
}

export function isMoveRequest(value: unknown): value is MoveRequest {
  return isRecord(value) && hasKeys(value, ["t", "v", "requestId", "expectedVersion", "from", "to", "promotion"])
    && value.t === "move" && value.v === PROTOCOL_VERSION
    && typeof value.requestId === "string" && value.requestId.trim().length > 0 && value.requestId.length <= 128
    && isVersion(value.expectedVersion) && isSquareId(value.from) && isSquareId(value.to)
    && (value.promotion === null || typeof value.promotion === "string" && /^[qrbn]$/.test(value.promotion));
}

const PROTOCOL_ERRORS: readonly ProtocolError[] = [
  "bad-message", "bad-version", "bad-token", "not-seated", "join-consumed", "match-expired", "no-match", "server-error",
  "frame-too-large", "rate-limited", "seat-replaced", "not-active", "game-over", "state-version-mismatch", "not-your-turn", "illegal-move",
];

/** Validate every received v2 field, including nested state; never reflect raw input. */
export function parseServerMessage(raw: string): DurableServerMessage | null {
  if (typeof raw !== "string") return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!isRecord(value)) return null;
  if (value.t === "seated" && hasKeys(value, ["t", "seat", "color", "state"], ["seatToken"])
    && (value.seat === "host" || value.seat === "guest") && isColor(value.color) && isDurableGameState(value.state)
    && (!Object.prototype.hasOwnProperty.call(value, "seatToken") || isPrivateToken(value.seatToken))) return value as unknown as SeatedMessage;
  if (value.t === "state" && hasKeys(value, ["t", "state"]) && isDurableGameState(value.state)) return value as unknown as StateMessage;
  if (value.t === "error" && hasKeys(value, ["t", "code", "fatal"], ["state"])
    && PROTOCOL_ERRORS.includes(value.code as ProtocolError) && typeof value.fatal === "boolean"
    && (!Object.prototype.hasOwnProperty.call(value, "state") || isDurableGameState(value.state))) return value as unknown as ErrorMessage;
  return null;
}
