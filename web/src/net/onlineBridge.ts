/** Applies durable canonical snapshots; player input never mutates the board optimistically. */
import type { GameController } from "../core/gameController";
import type { Faction, PieceKind, SquareId } from "../core/types";
import type { OnlineClient } from "./onlineClient";
import type { DurableGameState, PromotionPiece } from "./protocol";

export interface BridgeHandlers {
  onResync: () => void;
  onNotice: (text: string) => void;
}

export class OnlineBridge {
  private unsubscribes: (() => void)[] = [];
  private color: Faction = "w";
  private state: DurableGameState | null = null;
  private disposed = false;
  private terminal = false;
  private queued = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly client: OnlineClient, private readonly controller: GameController, private readonly handlers: BridgeHandlers) {
    this.unsubscribes.push(
      client.on("seated", ({ color, state }) => {
        this.color = color;
        this.reconcile(state, false);
      }),
      client.on("state", (state) => this.reconcile(state, true)),
      client.on("pending", (pending) => { if (pending) controller.setNetworkReady(false); }),
      client.on("status", ({ status }) => {
        // Transport errors can recover; only a fatal failure makes this bridge terminal.
        if (status !== "connected") controller.setNetworkReady(false);
      }),
      client.on("failed", ({ message, fatal, state }) => {
        if (fatal) this.terminal = true;
        controller.setNetworkReady(false);
        this.handlers.onNotice(message);
        const canonical = state ?? client.getState();
        if (!fatal && canonical) this.reconcile(canonical, false);
      }),
    );
    // The lobby can already have consumed seated/state before mounting the board.
    const seat = client.getSeat();
    const state = client.getState();
    if (seat?.color && state) { this.color = seat.color; this.begin(state); }
    else controller.setNetworkReady(false);
  }

  getColor(): Faction { return this.color; }

  private begin(state: DurableGameState): void {
    this.controller.setNetworkReady(false);
    this.controller.start({ mode: "online", difficulty: "medium", playerColor: this.color, clockMinutes: null, fen: state.fen });
    this.state = state;
    if (state.result) this.controller.applyRemoteResult(state.result);
    this.handlers.onResync();
    this.updateReady();
  }

  private reconcile(state: DurableGameState, animate: boolean): void {
    this.queued++;
    this.controller.setNetworkReady(false);
    this.queue = this.queue.then(async () => {
      if (this.disposed) return;
      if (!this.state) { this.begin(state); return; }
      if (state.stateVersion < this.state.stateVersion) return;
      const previous = this.state;
      // Only a single new ply with an unchanged prefix can animate. Reconnects,
      // mismatch corrections and ledger gaps always land directly on canonical FEN.
      const move = state.moves[state.moves.length - 1];
      const extendsLedger = state.moves.length === previous.moves.length + 1
        && previous.moves.every((entry, index) => JSON.stringify(entry) === JSON.stringify(state.moves[index]));
      if (animate && !this.terminal && state.stateVersion > previous.stateVersion && extendsLedger && move
        && this.controller.getSnapshot().fen === previous.fen) {
        await this.controller.applyRemoteMove(move.from as SquareId, move.to as SquareId, move.promotion ?? undefined);
      }
      if (this.disposed) return;
      // Check even after animation: the accepted snapshot is always authoritative.
      if (this.controller.syncToFen(state.fen)) this.handlers.onResync();
      this.state = state;
      if (state.result) this.controller.applyRemoteResult(state.result);
    }).catch(() => {
      this.terminal = true;
      this.handlers.onNotice("Could not restore the board. Reopen your private return link.");
    }).finally(() => { this.queued--; this.updateReady(); });
  }

  private updateReady(): void {
    this.controller.setNetworkReady(!this.disposed && !this.terminal && this.queued === 0
      && this.client.getStatus() === "connected" && !this.client.hasPendingMove()
      && this.state?.status === "active" && !this.state.over);
  }

  submitMove(from: SquareId, to: SquareId, promotion?: PieceKind): boolean {
    if (this.disposed || this.terminal || this.queued > 0 || !this.state || !this.controller.isNetworkReady()
      || !this.controller.isHumanTurn() || this.client.hasPendingMove()
      || promotion !== undefined && !["q", "r", "b", "n"].includes(promotion)) return false;
    try {
      this.client.sendMove(from, to, (promotion as PromotionPiece | undefined) ?? null, this.state.stateVersion);
      this.controller.setNetworkReady(false);
      return true;
    } catch { return false; }
  }

  /** Task 8: remove controls for unsupported Stage 2 actions. */
  resign(): void { this.client.resign(); }
  requestRematch(): void { this.client.requestRematch(); }

  dispose(): void {
    this.disposed = true;
    for (const off of this.unsubscribes) off();
    this.unsubscribes = [];
    this.controller.setNetworkReady(false);
  }
}
