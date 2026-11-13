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
