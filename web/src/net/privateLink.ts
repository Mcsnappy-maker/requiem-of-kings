import { isMatchId, isPrivateToken } from "./protocol";

export type PrivateIntent =
  | { kind: "seat"; matchId: string; token: string }
  | { kind: "join"; matchId: string; token: string };

type SeatIntent = Extract<PrivateIntent, { kind: "seat" }>;
const STORAGE_PREFIX = "rok.online.seats.";

/** Only the complete, canonical private fragment is accepted. */
export function readPrivateIntent(location: Pick<Location, "hash">): PrivateIntent | null {
  if (typeof location.hash !== "string") return null;
  const match = /^#match=([a-f0-9-]+)&(seat|join)=([A-Za-z0-9_-]+)$/.exec(location.hash);
  if (!match || !isMatchId(match[1]) || !isPrivateToken(match[3])) return null;
  return { kind: match[2] as PrivateIntent["kind"], matchId: match[1], token: match[3] };
}

/** replaceState removes credentials without a request or a navigation. */
export function clearPrivateFragment(history: Pick<History, "replaceState">, location: Location): void {
  history.replaceState(null, "", `${location.pathname}${location.search}`);
}

function buildPrivateLink(origin: string, pathname: string, matchId: string, token: string, kind: PrivateIntent["kind"]): string {
  try {
    const base = new URL(origin);
    if (!["https:", "http:"].includes(base.protocol) || base.username || base.password || base.search || base.hash
      || base.pathname !== "/" || (origin !== base.origin && origin !== `${base.origin}/`)
      || typeof pathname !== "string" || !/^\/(?!\/)/.test(pathname) || /[?#\\%\s]/.test(pathname)
      || !isMatchId(matchId) || !isPrivateToken(token)) throw new Error();
    const page = new URL(pathname, base.origin);
    if (page.origin !== base.origin || page.href.includes(token)) throw new Error();
    page.hash = `match=${matchId}&${kind}=${token}`;
    return page.href;
  } catch {
    // URL exceptions may contain input credentials; use a fixed replacement.
    throw new Error("Invalid private link");
  }
}

export function buildSeatLink(origin: string, pathname: string, matchId: string, token: string): string {
  return buildPrivateLink(origin, pathname, matchId, token, "seat");
}

export function buildJoinLink(origin: string, pathname: string, matchId: string, token: string): string {
  return buildPrivateLink(origin, pathname, matchId, token, "join");
}

function isSeatIntent(value: unknown): value is SeatIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const intent = value as Record<string, unknown>;
  return Object.keys(intent).length === 3 && intent.kind === "seat" && isMatchId(intent.matchId) && isPrivateToken(intent.token);
}

export function saveSeat(intent: SeatIntent): void {
  if (!isSeatIntent(intent)) return;
  try {
    // Do not persist credentials while the originating private fragment is visible.
    clearPrivateFragment(window.history, window.location);
    window.localStorage.setItem(`${STORAGE_PREFIX}${intent.matchId}`, JSON.stringify(intent));
  } catch {
    // Restricted storage/history is nonfatal; callers retain the seat in memory.
  }
}

export function loadSeat(matchId: string): SeatIntent | null {
  if (!isMatchId(matchId)) return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${matchId}`);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return isSeatIntent(value) && value.matchId === matchId ? value : null;
  } catch {
    return null;
  }
}
