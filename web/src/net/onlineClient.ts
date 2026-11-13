/** Durable private-match transport. Credentials travel only in private fragments or auth frames. */
import { Emitter } from "../core/emitter";
import type { SquareId } from "../core/types";
import { createRemoteMatch, MatchApiError } from "./matchApi";
import { buildJoinLink, buildSeatLink, loadSeat, saveSeat, type PrivateIntent } from "./privateLink";
import {
  PROTOCOL_VERSION, isMatchId, isPrivateToken, isMoveRequest, parseServerMessage,
  type AuthenticateRequest, type DurableGameState, type DurableServerMessage,
  type MoveRequest, type PromotionPiece, type SeatPreference, type WireColor,
} from "./protocol";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting" | "closed" | "error";
type SeatIntent = Extract<PrivateIntent, { kind: "seat" }>;
export interface HostedMatch {
  matchId: string;
  joinLink: string;
  returnLink: string;
  state: DurableGameState;
}
interface OnlineEvents {
  status: { status: ConnectionStatus; detail: string | null };
  // Task 8: remove `code`, a compile-only alias for the old lobby's match ID.
  seated: { matchId: string; code: string; color: WireColor; state: DurableGameState };
  state: DurableGameState;
  pending: boolean;
  failed: { code: string; message: string; fatal: boolean; state?: DurableGameState };
}
const LAST_MATCH_KEY = "rok.online.lastMatch";
const BACKOFF_MS = [500, 1000, 2000, 4000, 8000, 12_000];
const RESPONSE_TIMEOUT_MS = 10_000;

function socketOrigin(): string {
  const configured = import.meta.env.VITE_MULTIPLAYER_WS_URL as string | undefined;
  try {
    if (!configured) throw new Error();
    const base = new URL(configured);
    const local = base.protocol === "ws:" && ["localhost", "127.0.0.1"].includes(base.hostname);
    if (base.protocol !== "wss:" && !local || base.username || base.password || base.search || base.hash
      || base.pathname !== "/" || (configured !== base.origin && configured !== `${base.origin}/`)) throw new Error();
    return base.origin;
  } catch { throw new Error("Invalid multiplayer socket configuration"); }
}

/** Task 8 may rename this UI compatibility export. Both service origins must be explicit. */
export function relayAvailable(): boolean {
  try { return Boolean(import.meta.env.VITE_MULTIPLAYER_HTTP_URL && socketOrigin()); } catch { return false; }
}

function lastSeat(): SeatIntent | null {
  try { return loadSeat(window.localStorage.getItem(LAST_MATCH_KEY) ?? ""); } catch { return null; }
}
function validIntent(intent: PrivateIntent, kind: PrivateIntent["kind"]): boolean {
  return !!intent && intent.kind === kind && isMatchId(intent.matchId) && isPrivateToken(intent.token);
}

export class OnlineClient extends Emitter<OnlineEvents> {
  private socket: WebSocket | null = null;
  private status: ConnectionStatus = "idle";
  private seat: SeatIntent | null = lastSeat();
  private color: WireColor | null = null;
  private state: DurableGameState | null = null;
  private intent: PrivateIntent | null = null;
  private auth: AuthenticateRequest | null = null;
  private pendingMove: MoveRequest | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private responseTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private disposed = false;
  private terminal = false;
  private generation = 0;

  getStatus(): ConnectionStatus { return this.status; }
  getSeat(): (SeatIntent & { color: WireColor | null }) | null { return this.seat ? { ...this.seat, color: this.color } : null; }
  getState(): DurableGameState | null { return this.state; }
  hasResumableSeat(): boolean { return !this.terminal && this.seat !== null; }
  hasPendingMove(): boolean { return this.pendingMove !== null; }
  getReturnLink(): string | null {
    if (!this.seat) return null;
    try { return buildSeatLink(window.location.origin, window.location.pathname, this.seat.matchId, this.seat.token); }
    catch { return null; }
  }

  host(name: string, seat: SeatPreference): Promise<HostedMatch>;
  /** Task 8: remove this old lobby overload. Stage 1 never sends a clock setting. */
  host(name: string, seat: SeatPreference, legacyClock: number | null): void;
  host(name: string, seat: SeatPreference, legacyClock?: number | null): Promise<HostedMatch> | void {
    const request = this.createHost(name, seat);
    if (legacyClock !== undefined) { void request.catch(() => {}); return; }
    return request;
  }
  private async createHost(name: string, color: SeatPreference): Promise<HostedMatch> {
    if (this.disposed || this.terminal) throw new Error("This connection is closed");
    this.resetConnection();
    const generation = this.generation;
    this.setStatus("connecting");
    try {
      socketOrigin();
      const match = await createRemoteMatch({ name, color });
      if (this.disposed || generation !== this.generation) throw new Error("This connection is closed");
      this.remember({ kind: "seat", matchId: match.matchId, token: match.hostToken });
      this.state = match.state;
      const hosted: HostedMatch = {
        matchId: match.matchId, state: match.state,
        joinLink: buildJoinLink(window.location.origin, window.location.pathname, match.matchId, match.joinToken),
        returnLink: this.getReturnLink()!,
      };
      this.intent = this.seat;
      this.auth = { t: "resume", v: PROTOCOL_VERSION, token: match.hostToken };
      this.open();
      return hosted;
    } catch (error) {
      const message = error instanceof MatchApiError ? error.message : "Could not open private match";
      if (!this.disposed && generation === this.generation) {
        this.setStatus("error", message);
        this.fail("create-failed", message, false);
      }
      throw new Error(message);
    }
  }

  claim(intent: Extract<PrivateIntent, { kind: "join" }>, name: string): void {
    if (this.disposed || this.terminal) return;
    if (!validIntent(intent, "join") || typeof name !== "string") { this.fail("bad-message", "Invalid private invitation", true); return; }
    this.resetConnection();
    this.intent = { ...intent };
    this.seat = null;
    this.auth = { t: "claim", v: PROTOCOL_VERSION, token: intent.token, name };
    this.open();
  }

  resume(intent?: SeatIntent): boolean {
    if (this.disposed || this.terminal) return false;
    const selected = intent ?? this.seat ?? lastSeat();
    if (!selected) return false;
    if (!validIntent(selected, "seat")) return false;
    try { socketOrigin(); } catch { this.fail("configuration", "Multiplayer service is not configured", true); return false; }
    const pending = this.seat?.matchId === selected.matchId && this.seat.token === selected.token ? this.pendingMove : null;
    this.resetConnection();
    this.pendingMove = pending;
    this.remember(selected);
    this.intent = { ...selected };
    this.auth = { t: "resume", v: PROTOCOL_VERSION, token: selected.token };
    this.open();
    return true;
  }

  sendMove(from: SquareId, to: SquareId, promotion: PromotionPiece | null, expectedVersion = this.state?.stateVersion): string {
    if (this.status !== "connected" || !this.state || this.state.status !== "active" || this.state.turn !== this.color
      || this.pendingMove || expectedVersion !== this.state.stateVersion) throw new Error("The board is not ready for a move");
    const move: MoveRequest = { t: "move", v: PROTOCOL_VERSION, requestId: crypto.randomUUID(), expectedVersion, from, to, promotion };
    if (!isMoveRequest(move)) throw new Error("Invalid move");
    this.pendingMove = move;
    this.emit("pending", true);
    this.rawSend(move);
    this.armResponseTimeout();
    return move.requestId;
  }

  /** Task 8: remove code-only lobby entry. It must never authenticate a seat. */
  join(_name: string, _code: string): void { this.fail("private-link-required", "Use a private invitation link to join", false); }
  /** Task 8: remove these controls; the Stage 1 Worker does not accept them. */
  resign(): void { this.fail("unsupported", "Resignation is not available in this match", false); }
  requestRematch(): void { this.fail("unsupported", "Create a new private match to play again", false); }

  /** Leaving the board closes this connection; the durable seat remains available for return. */
  leave(): void {
    this.resetConnection();
    this.setStatus("closed");
  }
  dispose(): void { this.disposed = true; this.resetConnection(); this.clear(); }

  private remember(seat: SeatIntent): void {
    this.seat = { ...seat };
    saveSeat(this.seat);
    try {
      // saveSeat clears the fragment first. Never add storage when that failed.
      if (!window.location.hash) window.localStorage.setItem(LAST_MATCH_KEY, seat.matchId);
    } catch { /* Keep the credential in memory when storage is restricted. */ }
  }

  private open(): void {
    if (this.disposed || this.terminal || !this.intent || !this.auth) return;
    let url: string;
    try { url = `${socketOrigin()}/api/matches/${this.intent.matchId}/ws`; }
    catch { this.fail("configuration", "Multiplayer service is not configured", true); return; }
    this.setStatus(this.attempt ? "reconnecting" : "connecting");
    let socket: WebSocket;
    try { socket = new WebSocket(url); } catch { this.scheduleRetry(); return; }
    this.socket = socket;
    this.armResponseTimeout();
    socket.onopen = () => {
      if (this.socket !== socket || this.disposed || this.terminal) return;
      // Authentication is always the first frame, including every reconnect.
      this.rawSend(this.auth!);
      this.armResponseTimeout();
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket || this.disposed || this.terminal) return;
      const message = parseServerMessage(typeof event.data === "string" ? event.data : "");
      if (message) this.receive(message);
    };
    socket.onerror = () => { /* onclose handles retry, without logging credentials. */ };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.clearResponseTimeout();
      this.scheduleRetry();
    };
  }

  private receive(message: DurableServerMessage): void {
    if ("state" in message && message.state && message.state.matchId !== this.intent?.matchId) return;
    if (message.t === "seated") {
      if (this.auth?.t === "claim") {
        if (message.seat !== "guest" || !message.seatToken || !this.intent) { this.fail("bad-message", "Invalid seat response", true); return; }
        this.remember({ kind: "seat", matchId: this.intent.matchId, token: message.seatToken });
        this.intent = this.seat;
        this.auth = { t: "resume", v: PROTOCOL_VERSION, token: message.seatToken };
      }
      this.color = message.color;
      this.clearResponseTimeout();
      this.acceptState(message.state);
      this.attempt = 0;
      this.setStatus("connected");
      this.emit("seated", { matchId: message.state.matchId, code: message.state.matchId, color: message.color, state: this.state! });
      if (this.pendingMove) {
        this.rawSend(this.pendingMove);
        this.armResponseTimeout();
      }
      return;
    }
    if (message.t === "state") {
      if (this.status !== "connected" || !this.acceptState(message.state)) return;
      this.emit("state", message.state);
      return;
    }
    if (message.state) this.acceptState(message.state);
    this.clearPending();
    this.fail(message.code, message.code === "seat-replaced"
      ? "This seat is now open in another tab or device"
      : `Match request failed: ${message.code}`, message.fatal, message.state ? this.state ?? undefined : undefined);
  }

  private acceptState(state: DurableGameState): boolean {
    if (this.state && state.stateVersion < this.state.stateVersion) return false;
    this.state = state;
    if (this.pendingMove && state.stateVersion > this.pendingMove.expectedVersion) this.clearPending();
    return true;
  }
  private clearPending(): void {
    this.pendingMove = null;
    this.clearResponseTimeout();
    this.emit("pending", false);
  }
  private fail(code: string, message: string, fatal: boolean, state?: DurableGameState): void {
    if (fatal) {
      this.terminal = true;
      this.closeSocket();
      this.clearRetry();
      this.clearPending();
      this.setStatus("error", message);
    }
    this.emit("failed", { code, message, fatal, ...(state ? { state } : {}) });
  }
  private rawSend(message: AuthenticateRequest | MoveRequest): void {
    try {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error();
      this.socket.send(JSON.stringify(message));
    } catch { this.closeSocket(); this.scheduleRetry(); }
  }
  private armResponseTimeout(): void {
    this.clearResponseTimeout();
    this.responseTimer = setTimeout(() => { this.closeSocket(); this.scheduleRetry(); }, RESPONSE_TIMEOUT_MS);
  }
  private clearResponseTimeout(): void {
    if (this.responseTimer !== null) clearTimeout(this.responseTimer);
    this.responseTimer = null;
  }
  private scheduleRetry(): void {
    if (this.disposed || this.terminal || !this.auth) return;
    this.clearRetry();
    const delay = BACKOFF_MS[Math.min(this.attempt++, BACKOFF_MS.length - 1)];
    this.setStatus("reconnecting");
    this.retryTimer = setTimeout(() => { this.retryTimer = null; this.open(); }, delay);
  }
  private clearRetry(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
  private setStatus(status: ConnectionStatus, detail: string | null = null): void {
    this.status = status;
    this.emit("status", { status, detail });
  }
  private closeSocket(): void {
    this.clearResponseTimeout();
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
    try { socket.close(); } catch { /* Already closed. */ }
  }
  private resetConnection(): void {
    this.generation++;
    this.closeSocket();
    this.clearRetry();
    this.pendingMove = null;
    this.intent = null;
    this.auth = null;
    this.state = null;
    this.color = null;
    this.attempt = 0;
  }
}
