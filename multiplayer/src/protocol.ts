export const PROTOCOL_VERSION = 2;

export type SeatId = "host" | "guest";
export type WireColor = "w" | "b";
export type MatchStatus = "waiting" | "active" | "complete" | "expired";
export type PromotionPiece = "q" | "r" | "b" | "n";

export interface WireMove {
  ply: number;
  color: WireColor;
  from: string;
  to: string;
  promotion: PromotionPiece | null;
  san: string;
  fen: string;
}

export interface WireResult {
  winner: WireColor | null;
  reason: "checkmate" | "stalemate" | "threefold" | "insufficient" | "fiftymove" | "draw";
}

export interface WirePlayer {
  color: WireColor;
  name: string;
}

export interface WireGameState {
  matchId: string;
  status: MatchStatus;
  fen: string;
  moves: WireMove[];
  stateVersion: number;
  turn: WireColor;
  started: boolean;
  over: boolean;
  result: WireResult | null;
  players: WirePlayer[];
}

export interface MoveRequest {
  t: "move";
  v: 2;
  requestId: string;
  expectedVersion: number;
  from: string;
  to: string;
  promotion: PromotionPiece | null;
}

/** Validate untrusted frames before they reach the pure match state. */
export function isMoveRequest(body: Record<string, unknown>): body is Record<string, unknown> & MoveRequest {
  return body.t === "move" && body.v === PROTOCOL_VERSION && Object.keys(body).length === 7
    && typeof body.requestId === "string" && body.requestId.trim().length > 0 && body.requestId.length <= 128
    && typeof body.expectedVersion === "number" && Number.isSafeInteger(body.expectedVersion) && body.expectedVersion >= 0
    && typeof body.from === "string" && /^[a-h][1-8]$/.test(body.from)
    && typeof body.to === "string" && /^[a-h][1-8]$/.test(body.to)
    && (body.promotion === null || typeof body.promotion === "string" && /^[qrbn]$/.test(body.promotion));
}

export interface CreateMatchRequest {
  v: 2;
  name: string;
  color: WireColor | "random";
}

export interface CreateMatchResponse {
  matchId: string;
  hostToken: string;
  joinToken: string;
  state: WireGameState;
}

export type AuthenticateRequest =
  | { t: "resume"; v: 2; token: string }
  | { t: "claim"; v: 2; token: string; name: string };

export interface SeatedMessage {
  t: "seated";
  seat: SeatId;
  color: WireColor;
  state: WireGameState;
  /** Issued only once, in response to a successful invite claim. */
  seatToken?: string;
}

export interface StateMessage {
  t: "state";
  state: WireGameState;
}

export type AuthenticationError = "bad-message" | "bad-version" | "bad-token" | "not-seated" | "join-consumed" | "match-expired" | "no-match" | "server-error";

export type ProtocolError = AuthenticationError | "frame-too-large" | "rate-limited" | "seat-replaced"
  | "not-active" | "game-over" | "state-version-mismatch" | "not-your-turn" | "illegal-move";

export interface ErrorMessage {
  t: "error";
  code: ProtocolError;
  fatal: boolean;
  state?: WireGameState;
}
