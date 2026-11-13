import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PROTOCOL_VERSION,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  RECONNECT_GRACE_MS,
  isPromotionPiece,
  isSquareId,
  isValidRoomCode,
  normaliseRoomCode,
  parseMessage,
  isDurableGameState,
  isCreateMatchResponse,
  isMoveRequest,
  parseServerMessage,
} from "../net/protocol";
import { buildJoinLink, buildSeatLink, clearPrivateFragment, loadSeat, readPrivateIntent, saveSeat } from "../net/privateLink";
import { createRemoteMatch } from "../net/matchApi";
import { OnlineClient, relayAvailable } from "../net/onlineClient";
import { OnlineBridge } from "../net/onlineBridge";
import { GameController } from "../core/gameController";
import type { DurableGameState } from "../net/protocol";

// Regression coverage for the multiplayer layer. Every case below maps to a
// real defect or a real invariant verified during the live two-client test.

describe("room code normalisation", () => {
  it("uppercases and strips separators from a pasted code", () => {
    expect(normaliseRoomCode(" fq-qvr ")).toBe("FQQVR");
  });

  it("accepts a well-formed code", () => {
    expect(isValidRoomCode("FQQVR")).toBe(true);
  });

  it("rejects codes of the wrong length", () => {
    expect(isValidRoomCode("FQQV")).toBe(false);
    expect(isValidRoomCode("FQQVRX")).toBe(false);
  });

  it("rejects characters outside the ambiguity-free alphabet", () => {
    // A, E, I, L, O, U, 0 and 1 are deliberately excluded so a code read
    // aloud or over a screenshot cannot be mistyped.
    for (const bad of ["A", "E", "I", "L", "O", "U", "0", "1"]) {
      expect(ROOM_CODE_ALPHABET.includes(bad)).toBe(false);
      expect(isValidRoomCode(`FQQV${bad}`)).toBe(false);
    }
  });

  it("keeps the alphabet and length in sync with the generator contract", () => {
    expect(ROOM_CODE_LENGTH).toBe(5);
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(ROOM_CODE_ALPHABET.length);
  });
});

// D2: the lobby generated ?room=CODE share links but never read them, so an
// invite landed on the HOST tab with an empty field. This is the pure logic
// the component now uses on mount.
function readInviteCodeFrom(search: string): string {
  const raw = new URLSearchParams(search).get("room");
  if (!raw) return "";
  const clean = normaliseRoomCode(raw);
  return isValidRoomCode(clean) ? clean : "";
}

describe("invite deep link (?room=)", () => {
  it("extracts a valid code from a share link", () => {
    expect(readInviteCodeFrom("?room=FQQVR")).toBe("FQQVR");
  });

  it("normalises a lowercase or hyphenated invite", () => {
    expect(readInviteCodeFrom("?room=fq-qvr")).toBe("FQQVR");
  });

  it("returns empty for a missing param so the lobby defaults to HOST", () => {
    expect(readInviteCodeFrom("")).toBe("");
    expect(readInviteCodeFrom("?arena=dusk")).toBe("");
  });

  it("ignores a malformed code rather than prefilling garbage", () => {
    expect(readInviteCodeFrom("?room=XX")).toBe("");
    expect(readInviteCodeFrom("?room=AEIOU")).toBe("");
  });

  it("selects the JOIN tab only when an invite is present", () => {
    const tabFor = (search: string) => (readInviteCodeFrom(search) ? "join" : "host");
    expect(tabFor("?room=FQQVR")).toBe("join");
    expect(tabFor("?room=XX")).toBe("host");
    expect(tabFor("")).toBe("host");
  });
});

// D1: the shell subscribed to "status" after the client had already reached
// "connected" in the lobby, so the badge rendered OFFLINE mid-match. The fix
// seeds from the live getStatus() value before subscribing.
class FakeStatusSource {
  private status = "idle";
  private listeners: Array<(s: string) => void> = [];
  getStatus() {
    return this.status;
  }
  on(fn: (s: string) => void) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }
  set(next: string) {
    this.status = next;
    for (const l of this.listeners) l(next);
  }
}

describe("connection badge seeding", () => {
  it("subscribe-only misses a status reached before handoff", () => {
    const src = new FakeStatusSource();
    src.set("connected"); // happens in the lobby, before the shell mounts
    let netStatus = "idle";
    src.on((s) => {
      netStatus = s;
    });
    expect(netStatus).toBe("idle"); // the defect: renders OFFLINE
  });

  it("seeding from getStatus() reports the live connection", () => {
    const src = new FakeStatusSource();
    src.set("connected");
    let netStatus = "idle";
    netStatus = src.getStatus(); // the fix
    src.on((s) => {
      netStatus = s;
    });
    expect(netStatus).toBe("connected");
  });

  it("still tracks later transitions after seeding", () => {
    const src = new FakeStatusSource();
    src.set("connected");
    let netStatus = src.getStatus();
    src.on((s) => {
      netStatus = s;
    });
    src.set("reconnecting");
    expect(netStatus).toBe("reconnecting");
    src.set("connected");
    expect(netStatus).toBe("connected");
  });

  it("unsubscribing stops updates so a torn-down shell cannot be written to", () => {
    const src = new FakeStatusSource();
    let netStatus = src.getStatus();
    const off = src.on((s) => {
      netStatus = s;
    });
    off();
    src.set("closed");
    expect(netStatus).toBe("idle");
  });
});

describe("wire message parsing", () => {
  it("parses a well-formed tagged message", () => {
    const msg = parseMessage<{ t: string; code: string }>('{"t":"seated","code":"FQQVR"}');
    expect(msg?.t).toBe("seated");
  });

  it("returns null on malformed JSON instead of throwing", () => {
    expect(parseMessage("{not json")).toBeNull();
  });

  it("returns null on a non-object payload", () => {
    expect(parseMessage("42")).toBeNull();
    expect(parseMessage('"hello"')).toBeNull();
  });

  it("validates square ids", () => {
    expect(isSquareId("e4")).toBe(true);
    expect(isSquareId("a1")).toBe(true);
    expect(isSquareId("j9")).toBe(false);
    expect(isSquareId(42)).toBe(false);
    expect(isSquareId(null)).toBe(false);
  });

  it("validates promotion pieces including the null case", () => {
    expect(isPromotionPiece("q")).toBe(true);
    expect(isPromotionPiece(null)).toBe(true);
    expect(isPromotionPiece("k")).toBe(false);
    expect(isPromotionPiece(7)).toBe(false);
  });
});

describe("session constants", () => {
  it("pins the protocol version so a mismatched client is rejected, not silently broken", () => {
    expect(PROTOCOL_VERSION).toBe(2);
  });

  it("holds a disconnected seat long enough to survive a refresh", () => {
    expect(RECONNECT_GRACE_MS).toBeGreaterThanOrEqual(30_000);
  });
});

// Complete fixtures mirror the concrete Stage 1 Worker responses.
const MATCH_ID = "12345678-1234-1234-1234-123456789abc";
const OTHER_MATCH_ID = "abcdefab-1234-1234-1234-123456789abc";
const TEST_TOKEN = "private_test_seat_token_never_in_bundle_12345";
const JOIN_TOKEN = "private_test_join_token_never_in_bundle_12345";
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const waitingState = () => ({
  matchId: MATCH_ID, status: "waiting", fen: START_FEN, moves: [], stateVersion: 0,
  turn: "w", started: false, over: false, result: null, players: [{ color: "w", name: "Host" }],
});
const createdMatch = () => ({ matchId: MATCH_ID, hostToken: TEST_TOKEN, joinToken: JOIN_TOKEN, state: waitingState() });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("private fragment credentials", () => {
  it.each(["seat", "join"] as const)("reads a valid %s fragment", (kind) => {
    expect(readPrivateIntent({ hash: `#match=${MATCH_ID}&${kind}=${TEST_TOKEN}` })).toEqual({ kind, matchId: MATCH_ID, token: TEST_TOKEN });
  });

  it.each([
    "", `?match=${MATCH_ID}&seat=${TEST_TOKEN}`, `#match=${MATCH_ID}&seat=short`,
    `#match=invalid&seat=${TEST_TOKEN}`, `#match=${MATCH_ID}&seat=${TEST_TOKEN}&join=${JOIN_TOKEN}`,
    `#match=${MATCH_ID}&seat=${TEST_TOKEN}&seat=${TEST_TOKEN}`, `#match=${MATCH_ID}&match=${MATCH_ID}&seat=${TEST_TOKEN}`,
    `#match=${MATCH_ID}&seat=${TEST_TOKEN}&extra=1`, `#match=${MATCH_ID}&seat=${TEST_TOKEN}%`,
    `#match=${MATCH_ID}&seat=${TEST_TOKEN}+`, `#match=${MATCH_ID}&seat=${TEST_TOKEN}/`,
    `#match=${MATCH_ID}&seat=${"x".repeat(129)}`, `#match=${MATCH_ID}&seat=${TEST_TOKEN}&`,
    `#match=${MATCH_ID}&seat=${TEST_TOKEN}%0a`, `#match=${MATCH_ID}&seat=${TEST_TOKEN}=`, `#match=${MATCH_ID}&seat=${TEST_TOKEN}\n`])("fails closed on malformed fragments: %s", (hash) => {
    expect(readPrivateIntent({ hash })).toBeNull();
  });

  it.each([buildSeatLink, buildJoinLink])("keeps the credential exclusively in the fragment", (build) => {
    const url = new URL(build("https://game.example", "/chess/", MATCH_ID, TEST_TOKEN));
    expect(url.origin).toBe("https://game.example");
    expect(url.pathname).toBe("/chess/");
    expect(url.search).toBe("");
    expect(url.href.split("#")[0]).not.toContain(TEST_TOKEN);
    expect(readPrivateIntent(url)?.token).toBe(TEST_TOKEN);
  });

  it.each([
    ["https://game.example/path", "/"], ["https://game.example?secret=1", "/"],
    ["https://user:password@game.example", "/"], ["https://game.example", "//other.example/"],
    ["https://game.example", `/game?seat=${TEST_TOKEN}`], ["https://game.example", `/game#seat=${TEST_TOKEN}`],
    ["https://game.example", `/return/${TEST_TOKEN}`], ["javascript:alert(1)", "/"],
  ])("rejects a non-origin or unsafe page path without echoing credentials", (origin, pathname) => {
    expect(() => buildSeatLink(origin, pathname, MATCH_ID, TEST_TOKEN)).toThrow("Invalid private link");
  });

  it("rejects malformed IDs and tokens when building a link", () => {
    expect(() => buildJoinLink("https://game.example", "/", "bad", TEST_TOKEN)).toThrow("Invalid private link");
    expect(() => buildSeatLink("https://game.example", "/", MATCH_ID, "short")).toThrow("Invalid private link");
  });

  it("removes the fragment without navigating and keeps the page path/query", () => {
    const replaceState = vi.fn();
    const location = new URL(`https://game.example/chess/?theme=dark#match=${MATCH_ID}&seat=${TEST_TOKEN}`);
    clearPrivateFragment({ replaceState }, location as unknown as Location);
    expect(replaceState).toHaveBeenCalledExactlyOnceWith(null, "", "/chess/?theme=dark");
  });
});

function installBrowser(hash = "") {
  const location = new URL(`https://game.example/chess/${hash}`);
  const values = new Map<string, string>();
  const events: string[] = [];
  const localStorage = {
    setItem(key: string, value: string) { events.push("store"); values.set(key, value); },
    getItem(key: string) { return values.get(key) ?? null; },
  };
  const history = { replaceState: vi.fn((_state: unknown, _unused: string, path: string) => {
    events.push("clear"); location.href = new URL(path, location.origin).href;
  }) };
  vi.stubGlobal("window", { location, history, localStorage });
  return { location, localStorage, history, values, events };
}

describe("private seat persistence", () => {
  it("clears a private fragment before saving the relevant seat in localStorage", () => {
    const browser = installBrowser(`#match=${MATCH_ID}&seat=${TEST_TOKEN}`);
    saveSeat({ kind: "seat", matchId: MATCH_ID, token: TEST_TOKEN });
    expect(browser.events).toEqual(["clear", "store"]);
    expect(browser.location.hash).toBe("");
    expect([...browser.values.keys()]).toEqual([`rok.online.seats.${MATCH_ID}`]);
    expect(loadSeat(MATCH_ID)).toEqual({ kind: "seat", matchId: MATCH_ID, token: TEST_TOKEN });
    expect(loadSeat(OTHER_MATCH_ID)).toBeNull();
  });

  it("does not save a token when fragment removal fails", () => {
    const browser = installBrowser(`#match=${MATCH_ID}&seat=${TEST_TOKEN}`);
    browser.history.replaceState.mockImplementation(() => { throw new Error(TEST_TOKEN); });
    expect(() => saveSeat({ kind: "seat", matchId: MATCH_ID, token: TEST_TOKEN })).not.toThrow();
    expect(browser.values.size).toBe(0);
  });

  it("treats blocked localStorage reads/writes as nonfatal", () => {
    const browser = installBrowser();
    vi.spyOn(browser.localStorage, "setItem").mockImplementation(() => { throw new Error(TEST_TOKEN); });
    vi.spyOn(browser.localStorage, "getItem").mockImplementation(() => { throw new Error(TEST_TOKEN); });
    expect(() => saveSeat({ kind: "seat", matchId: MATCH_ID, token: TEST_TOKEN })).not.toThrow();
    expect(loadSeat(MATCH_ID)).toBeNull();
  });

  it.each(["not-json", "null", "[]", JSON.stringify({ kind: "join", matchId: MATCH_ID, token: TEST_TOKEN }),
    JSON.stringify({ kind: "seat", matchId: OTHER_MATCH_ID, token: TEST_TOKEN }),
    JSON.stringify({ kind: "seat", matchId: MATCH_ID, token: "short" })])("ignores corrupt or mismatched saved credentials", (value) => {
    const browser = installBrowser();
    browser.values.set(`rok.online.seats.${MATCH_ID}`, value);
    expect(loadSeat(MATCH_ID)).toBeNull();
  });

  it("rejects invalid seat intents before storage", () => {
    const browser = installBrowser();
    saveSeat({ kind: "seat", matchId: MATCH_ID, token: "short" });
    saveSeat({ kind: "join", matchId: MATCH_ID, token: TEST_TOKEN } as never);
    expect(browser.values.size).toBe(0);
  });

  it("works without a browser and never falls back to the legacy session seat", () => {
    vi.stubGlobal("sessionStorage", { getItem: () => JSON.stringify({ code: MATCH_ID, token: TEST_TOKEN, color: "w" }) });
    expect(() => saveSeat({ kind: "seat", matchId: MATCH_ID, token: TEST_TOKEN })).not.toThrow();
    expect(loadSeat(MATCH_ID)).toBeNull();
  });
});

describe("durable Worker protocol validation", () => {
  it("accepts exact Stage 1 state, seat assignment, and state updates", () => {
    const state = waitingState();
    expect(isDurableGameState(state)).toBe(true);
    expect(isCreateMatchResponse(createdMatch())).toBe(true);
    for (const message of [
      { t: "seated", seat: "host", color: "w", state },
      { t: "seated", seat: "guest", color: "b", state, seatToken: TEST_TOKEN },
      { t: "state", state },
    ]) expect(parseServerMessage(JSON.stringify(message))).toEqual(message);
  });

  it.each(["join-consumed", "seat-replaced", "bad-version", "bad-token", "match-expired", "frame-too-large", "rate-limited"])("accepts fatal %s errors without an invented message field", (code) => {
    const message = { t: "error", code, fatal: true };
    expect(parseServerMessage(JSON.stringify(message))).toEqual(message);
  });

  it("accepts canonical state on version mismatch", () => {
    const message = { t: "error", code: "state-version-mismatch", fatal: false, state: waitingState() };
    expect(parseServerMessage(JSON.stringify(message))).toEqual(message);
  });

  it.each([
    { stateVersion: -1 }, { stateVersion: 0.5 }, { matchId: "bad" }, { matchId: `${MATCH_ID}\n` }, { status: "paused" },
    { moves: [null] }, { players: [{ color: "red", name: "Host" }] },
    { result: { winner: "w", reason: "timeout" } }, { turn: "red" }, { started: "false" },
    { fen: null }, { clock: { enabled: false } },
  ])("rejects malformed state and Stage 2 fields: %j", (patch) => {
    const state = { ...waitingState(), ...patch };
    expect(isDurableGameState(state)).toBe(false);
    expect(isCreateMatchResponse({ ...createdMatch(), state })).toBe(false);
    expect(parseServerMessage(JSON.stringify({ t: "state", state }))).toBeNull();
  });

  it.each([
    { t: "hello", v: 1 }, { t: "seated", code: "ABCDE", token: TEST_TOKEN },
    { t: "seated", seat: "host", color: "w", state: waitingState(), seatToken: "short" },
    { t: "error", code: TEST_TOKEN, fatal: true }, { t: "error", code: "seat-replaced", fatal: "true" },
    { t: "error", code: "server-error", fatal: true, message: TEST_TOKEN },
    { t: "error", code: "bad-token", fatal: true, state: null },
    { t: "state", state: waitingState(), token: TEST_TOKEN },
  ])("rejects malformed, legacy, or unexpected socket fields", (message) => {
    expect(parseServerMessage(JSON.stringify(message))).toBeNull();
  });

  it("accepts a complete growing ledger beyond the client-frame size limit", () => {
    const move = { ply: 1, color: "w", from: "e2", to: "e4", promotion: null, san: "e4", fen: START_FEN };
    const state = { ...waitingState(), moves: Array.from({ length: 500 }, (_, index) => ({ ...move, ply: index + 1 })), stateVersion: 500 };
    const raw = JSON.stringify({ t: "state", state });
    expect(raw.length).toBeGreaterThan(64 * 1024);
    expect(parseServerMessage(raw)).toEqual({ t: "state", state });
  });
  it("rejects malformed and non-object socket JSON", () => {
    for (const raw of ["{", "[]", "null", "42", "x".repeat(65_537)]) expect(parseServerMessage(raw)).toBeNull();
  });

  it("requires the Worker move envelope including request ID and expected version", () => {
    const move = { t: "move", v: 2, requestId: "request-1", expectedVersion: 0, from: "e2", to: "e4", promotion: null };
    expect(isMoveRequest(move)).toBe(true);
    for (const patch of [{ v: 1 }, { requestId: "" }, { expectedVersion: -1 }, { from: "j9" }, { promotion: "k" }, { token: TEST_TOKEN }]) {
      expect(isMoveRequest({ ...move, ...patch })).toBe(false);
    }
  });
});

describe("private match HTTP creation", () => {
  function mockCreate(body: unknown = createdMatch(), status = 201) {
    vi.stubEnv("VITE_MULTIPLAYER_HTTP_URL", "https://matches.example");
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  it("POSTs the exact Worker body to the configured HTTP origin and accepts 201", async () => {
    const fetch = mockCreate();
    const result = await createRemoteMatch({ name: "Host", color: "random", token: TEST_TOKEN } as never);
    expect(result).toEqual(createdMatch());
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://matches.example/api/matches");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(options.body as string)).toEqual({ v: 2, name: "Host", color: "random" });
    expect(JSON.stringify([url, options])).not.toContain(TEST_TOKEN);
    expect(options.credentials).toBe("omit");
    expect(options.redirect).toBe("error");
    expect(options.referrerPolicy).toBe("no-referrer");
  });

  it("uses only VITE_MULTIPLAYER_HTTP_URL, with no legacy/socket/page fallback", async () => {
    const fetch = mockCreate();
    vi.stubEnv("VITE_MULTIPLAYER_HTTP_URL", "");
    vi.stubEnv("VITE_MULTIPLAYER_URL", "https://legacy.example");
    vi.stubEnv("VITE_MULTIPLAYER_WS_URL", "wss://sockets.example");
    installBrowser();
    await expect(createRemoteMatch({ name: "Host", color: "w" })).rejects.toThrow("Multiplayer service is not configured");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    `https://matches.example?token=${TEST_TOKEN}`, `https://matches.example/#${TEST_TOKEN}`,
    `https://${TEST_TOKEN}@matches.example`, `https://matches.example/${TEST_TOKEN}`,
    "http://matches.example", "wss://matches.example", "invalid",
  ])("rejects unsafe service configuration without reflecting it", async (base) => {
    const fetch = mockCreate();
    vi.stubEnv("VITE_MULTIPLAYER_HTTP_URL", base);
    await expect(createRemoteMatch({ name: "Host", color: "b" })).rejects.toThrow("Invalid multiplayer service URL");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows a local HTTP Worker origin with a trailing slash", async () => {
    const fetch = mockCreate();
    vi.stubEnv("VITE_MULTIPLAYER_HTTP_URL", "http://127.0.0.1:8787/");
    await createRemoteMatch({ name: "Host", color: "w" });
    expect(fetch.mock.calls[0][0]).toBe("http://127.0.0.1:8787/api/matches");
  });

  it.each([400, 403, 404, 429, 500])("rejects HTTP %s safely without echoing unknown server data", async (status) => {
    mockCreate({ error: TEST_TOKEN, detail: TEST_TOKEN }, status);
    await expect(createRemoteMatch({ name: "Host", color: "w" })).rejects.toThrow("Could not create match");
  });

  it.each(["bad-message", "bad-version", "origin-not-allowed", "https-required", "not-found", "server-error"])("recognises the documented HTTP %s error", async (error) => {
    mockCreate({ error }, 400);
    await expect(createRemoteMatch({ name: "Host", color: "w" })).rejects.toMatchObject({ code: error });
  });

  it.each([
    null, [], {}, { ...createdMatch(), hostToken: `${TEST_TOKEN}\n` }, { ...createdMatch(), hostToken: "short" }, { ...createdMatch(), joinToken: "short" },
    { ...createdMatch(), joinToken: TEST_TOKEN }, { ...createdMatch(), matchId: OTHER_MATCH_ID },
    { ...createdMatch(), state: { ...waitingState(), stateVersion: "0" } },
    { ...createdMatch(), websocketUrl: `wss://matches.example/?token=${TEST_TOKEN}` },
  ])("rejects malformed creation responses", async (body) => {
    mockCreate(body);
    await expect(createRemoteMatch({ name: "Host", color: "w" })).rejects.toThrow("Invalid match service response");
  });

  it("requires 201 even for otherwise valid JSON", async () => {
    mockCreate(createdMatch(), 200);
    await expect(createRemoteMatch({ name: "Host", color: "w" })).rejects.toThrow("Invalid match service response");
  });

  it("sanitises JSON parse and network exceptions", async () => {
    mockCreate();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error(TEST_TOKEN); }));
    await expect(createRemoteMatch({ name: "Host", color: "w" })).rejects.toThrow("Could not create match");
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 201, ok: true, json: async () => { throw new Error(TEST_TOKEN); } })));
    await expect(createRemoteMatch({ name: "Host", color: "w" })).rejects.toThrow("Invalid match service response");
  });

  it.each([{ name: 42, color: "w" }, { name: "Host", color: "red" }, null])("rejects invalid creation input before sending HTTP", async (input) => {
    const fetch = mockCreate();
    await expect(createRemoteMatch(input as never)).rejects.toThrow("Invalid match request");
    expect(fetch).not.toHaveBeenCalled();
  });
});

// Real client/bridge with only the browser network boundary replaced.
class TestSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static instances: TestSocket[] = [];
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  constructor(readonly url: string) { TestSocket.instances.push(this); }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(message: unknown) { this.onmessage?.({ data: JSON.stringify(message) }); }
  send(raw: string) { this.sent.push(JSON.parse(raw)); }
  close() { this.readyState = 3; this.onclose?.(); }
}
const activeState = (): DurableGameState => ({
  ...waitingState(), status: "active", stateVersion: 1, turn: "w", started: true,
  players: [{ color: "w", name: "Host" }, { color: "b", name: "Guest" }],
});
const afterE4 = (): DurableGameState => ({
  ...activeState(), stateVersion: 2, turn: "b",
  fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  moves: [{ ply: 1, color: "w", from: "e2", to: "e4", promotion: null, san: "e4", fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1" }],
});
function clientEnvironment(hash = "") {
  const browser = installBrowser(hash);
  vi.useFakeTimers();
  vi.stubEnv("VITE_MULTIPLAYER_HTTP_URL", "https://api.example");
  vi.stubEnv("VITE_MULTIPLAYER_WS_URL", "wss://socket.example");
  vi.stubGlobal("WebSocket", TestSocket);
  TestSocket.instances = [];
  const fetch = vi.fn(async (_url: string, _options?: RequestInit) => new Response(JSON.stringify(createdMatch()), { status: 201 }));
  vi.stubGlobal("fetch", fetch);
  return { ...browser, fetch };
}
function connectHost(state = activeState()) {
  const client = new OnlineClient();
  client.resume({ kind: "seat", matchId: MATCH_ID, token: TEST_TOKEN });
  const socket = TestSocket.instances[TestSocket.instances.length - 1]!;
  socket.open();
  socket.receive({ t: "seated", seat: "host", color: "w", state });
  return { client, socket };
}
async function drainBridge() { await vi.advanceTimersByTimeAsync(0); }

describe("durable client state machine", () => {
  it("allows another host attempt after an HTTP outage", async () => {
    const browser = clientEnvironment();
    browser.fetch.mockRejectedValueOnce(new Error(TEST_TOKEN));
    const client = new OnlineClient();
    await expect(client.host("Host", "w")).rejects.toThrow("Could not create match");
    await expect(client.host("Host", "w")).resolves.toMatchObject({ matchId: MATCH_ID });
    client.dispose();
  });
  it("retries a socket that never opens instead of leaving the board connecting forever", () => {
    clientEnvironment();
    const client = new OnlineClient();
    client.resume({ kind: "seat", matchId: MATCH_ID, token: TEST_TOKEN });
    vi.advanceTimersByTime(10_500);
    expect(TestSocket.instances).toHaveLength(2);
    expect(TestSocket.instances[0].readyState).toBe(3);
    client.dispose();
  });
  it("keeps the unresolved request when manually resuming the same seat", () => {
    clientEnvironment();
    const { client, socket } = connectHost();
    client.sendMove("e2", "e4", null);
    const move = socket.sent[1];
    socket.close();
    client.resume();
    const retry = TestSocket.instances[1];
    retry.open();
    retry.receive({ t: "seated", seat: "host", color: "w", state: activeState() });
    expect(retry.sent[1]).toEqual(move);
    client.dispose();
  });
  it("creates over HTTP, persists host immediately, then authenticates the match socket", async () => {
    const browser = clientEnvironment();
    const client = new OnlineClient();
    const hosted = await client.host("Host", "w");
    expect(browser.fetch.mock.calls[0]?.[0]).toBe("https://api.example/api/matches");
    expect(loadSeat(MATCH_ID)?.token).toBe(TEST_TOKEN);
    expect(hosted.joinLink).toBe(`https://game.example/chess/#match=${MATCH_ID}&join=${JOIN_TOKEN}`);
    expect(client.getReturnLink()).toBe(`https://game.example/chess/#match=${MATCH_ID}&seat=${TEST_TOKEN}`);
    const socket = TestSocket.instances[0];
    expect(socket.url).toBe(`wss://socket.example/api/matches/${MATCH_ID}/ws`);
    expect(socket.sent).toEqual([]);
    socket.open();
    expect(socket.sent).toEqual([{ t: "resume", v: 2, token: TEST_TOKEN }]);
    expect(client.getStatus()).toBe("connecting");
    socket.receive({ t: "seated", seat: "host", color: "w", state: waitingState() });
    expect(client.getStatus()).toBe("connected");
    client.dispose();
  });
  it("claims once and replaces the private join fragment with a saved guest seat", () => {
    const browser = clientEnvironment(`#match=${MATCH_ID}&join=${JOIN_TOKEN}`);
    const client = new OnlineClient();
    client.claim({ kind: "join", matchId: MATCH_ID, token: JOIN_TOKEN }, "Guest");
    const socket = TestSocket.instances[0];
    socket.open();
    expect(socket.sent).toEqual([{ t: "claim", v: 2, token: JOIN_TOKEN, name: "Guest" }]);
    socket.receive({ t: "seated", seat: "guest", color: "b", state: activeState(), seatToken: TEST_TOKEN });
    expect(browser.location.hash).toBe("");
    expect(loadSeat(MATCH_ID)).toEqual({ kind: "seat", matchId: MATCH_ID, token: TEST_TOKEN });
    expect(JSON.stringify([...browser.values])).not.toContain(JOIN_TOKEN);
    socket.close();
    vi.advanceTimersByTime(500);
    const retry = TestSocket.instances[1];
    retry.open();
    expect(retry.sent).toEqual([{ t: "resume", v: 2, token: TEST_TOKEN }]);
    client.dispose();
  });
  it("reopens a locally saved seat without any URL credentials", async () => {
    clientEnvironment();
    const first = new OnlineClient();
    await first.host("Host", "w");
    first.dispose();
    const reopened = new OnlineClient();
    expect(reopened.hasResumableSeat()).toBe(true);
    expect(reopened.resume()).toBe(true);
    const socket = TestSocket.instances[TestSocket.instances.length - 1]!;
    socket.open();
    expect(socket.sent[0]).toEqual({ t: "resume", v: 2, token: TEST_TOKEN });
    reopened.dispose();
  });
  it("resumes a return link on a new browser and clears it before persistence", () => {
    const browser = clientEnvironment(`#match=${MATCH_ID}&seat=${TEST_TOKEN}`);
    const intent = readPrivateIntent(browser.location)!;
    const client = new OnlineClient();
    expect(client.resume(intent as Extract<typeof intent, { kind: "seat" }>)).toBe(true);
    expect(browser.events.slice(0, 2)).toEqual(["clear", "store"]);
    expect(browser.location.hash).toBe("");
    TestSocket.instances[0].open();
    expect(TestSocket.instances[0].sent[0]).toEqual({ t: "resume", v: 2, token: TEST_TOKEN });
    client.dispose();
  });
  it("retains a move UUID through reconnect and waits for authentication before retrying", () => {
    clientEnvironment();
    const { client, socket } = connectHost();
    const id = client.sendMove("e2", "e4", null);
    expect(id).toMatch(/^[a-f0-9-]{36}$/);
    const move = { t: "move", v: 2, requestId: id, expectedVersion: 1, from: "e2", to: "e4", promotion: null };
    expect(socket.sent[1]).toEqual(move);
    expect(() => client.sendMove("d2", "d4", null)).toThrow();
    socket.close();
    expect(client.getStatus()).toBe("reconnecting");
    vi.advanceTimersByTime(500);
    const retry = TestSocket.instances[1];
    retry.open();
    expect(retry.sent).toEqual([{ t: "resume", v: 2, token: TEST_TOKEN }]);
    retry.receive({ t: "seated", seat: "host", color: "w", state: activeState() });
    expect(retry.sent[1]).toEqual(move);
    retry.receive({ t: "state", state: afterE4() });
    expect(client.hasPendingMove()).toBe(false);
    client.dispose();
  });
  it("does not resend an acknowledged move after a lost response", () => {
    clientEnvironment();
    const { client, socket } = connectHost();
    client.sendMove("e2", "e4", null);
    socket.close();
    vi.advanceTimersByTime(500);
    const retry = TestSocket.instances[1];
    retry.open();
    retry.receive({ t: "seated", seat: "host", color: "w", state: afterE4() });
    expect(retry.sent).toHaveLength(1);
    expect(client.hasPendingMove()).toBe(false);
    client.dispose();
  });
  it("retries an unanswered move with the identical envelope and never sends legacy heartbeats", () => {
    clientEnvironment();
    const { client, socket } = connectHost();
    client.sendMove("e2", "e4", null);
    const move = socket.sent[1];
    // An equal-version snapshot does not acknowledge this request.
    socket.receive({ t: "state", state: activeState() });
    expect(client.hasPendingMove()).toBe(true);
    vi.advanceTimersByTime(10_500);
    const retry = TestSocket.instances[1];
    retry.open();
    retry.receive({ t: "seated", seat: "host", color: "w", state: activeState() });
    expect(retry.sent).toEqual([{ t: "resume", v: 2, token: TEST_TOKEN }, move]);
    retry.receive({ t: "state", state: afterE4() });
    vi.advanceTimersByTime(60_000);
    expect(retry.sent).toHaveLength(2);
    expect(TestSocket.instances).toHaveLength(2);
    client.dispose();
  });
  it("ignores malformed, wrong-match, and stale snapshots", () => {
    clientEnvironment();
    const { client, socket } = connectHost();
    socket.receive({ t: "state", state: { ...afterE4(), matchId: OTHER_MATCH_ID } });
    socket.receive({ t: "state", state: { ...afterE4(), stateVersion: "2" } });
    expect(client.getState()).toEqual(activeState());
    socket.receive({ t: "state", state: afterE4() });
    socket.receive({ t: "state", state: activeState() });
    expect(client.getState()).toEqual(afterE4());
    client.dispose();
  });
  it("keeps credentials out of logs when socket construction or send fails", () => {
    clientEnvironment();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, socket } = connectHost();
    vi.spyOn(socket, "send").mockImplementationOnce(() => { throw new Error(TEST_TOKEN); });
    client.sendMove("e2", "e4", null);
    vi.stubGlobal("WebSocket", class { constructor() { throw new Error(TEST_TOKEN); } });
    vi.advanceTimersByTime(500);
    expect(client.getStatus()).toBe("reconnecting");
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    client.dispose();
  });
  it("does not open a socket if hosting was disposed while HTTP was pending", async () => {
    const browser = clientEnvironment();
    let finish!: (value: Response) => void;
    browser.fetch.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const client = new OnlineClient();
    const hosted = client.host("Host", "w");
    client.dispose();
    finish(new Response(JSON.stringify(createdMatch()), { status: 201 }));
    await expect(hosted).rejects.toThrow("Could not open private match");
    expect(TestSocket.instances).toHaveLength(0);
    expect(client.getState()).toBeNull();
  });
  it("treats seat replacement as terminal and ignores callbacks from the old socket", () => {
    clientEnvironment();
    const { client, socket } = connectHost();
    const staleMessage = socket.onmessage!;
    socket.receive({ t: "error", code: "seat-replaced", fatal: true });
    expect(client.getStatus()).toBe("error");
    expect(() => client.sendMove("e2", "e4", null)).toThrow();
    expect(client.resume()).toBe(false);
    staleMessage({ data: JSON.stringify({ t: "seated", seat: "host", color: "w", state: activeState() }) });
    vi.advanceTimersByTime(60_000);
    expect(client.getStatus()).toBe("error");
    expect(TestSocket.instances).toHaveLength(1);
    client.dispose();
  });
  it("never uses a room code or the legacy/page origin as socket authority", () => {
    clientEnvironment();
    vi.stubEnv("VITE_MULTIPLAYER_WS_URL", "");
    vi.stubEnv("VITE_MULTIPLAYER_URL", "wss://legacy.example");
    expect(relayAvailable()).toBe(false);
    const client = new OnlineClient();
    client.join("Guest", "FQQVR");
    expect(TestSocket.instances).toHaveLength(0);
    client.dispose();
  });
  it.each([`wss://socket.example/?token=${TEST_TOKEN}`, `wss://${TEST_TOKEN}@socket.example`, "ws://remote.example", "https://socket.example"])("rejects unsafe WS configuration without exposing it", (url) => {
    clientEnvironment();
    vi.stubEnv("VITE_MULTIPLAYER_WS_URL", url);
    const client = new OnlineClient();
    expect(client.resume({ kind: "seat", matchId: MATCH_ID, token: TEST_TOKEN })).toBe(false);
    expect(TestSocket.instances).toHaveLength(0);
    expect(client.getStatus()).toBe("error");
    client.dispose();
  });
});

describe("durable bridge canonical reconciliation", () => {
  it("restores board control after a recoverable host failure and successful retry", async () => {
    const browser = clientEnvironment();
    browser.fetch.mockRejectedValueOnce(new Error("Temporary outage"));
    const client = new OnlineClient();
    const controller = new GameController();
    const bridge = new OnlineBridge(client, controller, { onResync: vi.fn(), onNotice: vi.fn() });
    try {
      await expect(client.host("Host", "w")).rejects.toThrow("Could not create match");
      expect(client.getStatus()).toBe("error");
      expect(controller.isNetworkReady()).toBe(false);
      expect(bridge.submitMove("e2", "e4")).toBe(false);
      await client.host("Host", "w");
      const socket = TestSocket.instances[0];
      socket.open();
      socket.receive({ t: "seated", seat: "host", color: "w", state: activeState() });
      await drainBridge();
      expect(client.getStatus()).toBe("connected");
      expect(controller.isNetworkReady()).toBe(true);
      expect(bridge.submitMove("e2", "e4")).toBe(true);
      expect(socket.sent[1]).toMatchObject({ t: "move", expectedVersion: 1, from: "e2", to: "e4" });
      expect(controller.pieceAt("e2")?.kind).toBe("p");
    } finally {
      bridge.dispose(); client.dispose(); controller.stop();
    }
  });
  function setup() {
    clientEnvironment();
    const { client, socket } = connectHost();
    const controller = new GameController();
    const animator = vi.fn(async () => {});
    controller.setAnimator(animator);
    const bridge = new OnlineBridge(client, controller, { onResync: vi.fn(), onNotice: vi.fn() });
    return { client, socket, controller, animator, bridge, dispose() { bridge.dispose(); client.dispose(); controller.stop(); } };
  }
  it("seeds a board after lobby handoff and permits only one server-first move", async () => {
    const test = setup();
    expect(test.controller.getSnapshot().mode).toBe("online");
    expect(test.controller.isNetworkReady()).toBe(true);
    expect(test.bridge.submitMove("e2", "e4")).toBe(true);
    expect(test.controller.pieceAt("e2")?.kind).toBe("p");
    expect(test.controller.isNetworkReady()).toBe(false);
    expect(test.bridge.submitMove("d2", "d4")).toBe(false);
    test.socket.receive({ t: "state", state: afterE4() });
    await drainBridge();
    expect(test.controller.pieceAt("e4")?.kind).toBe("p");
    expect(test.animator).toHaveBeenCalledTimes(1);
    test.socket.receive({ t: "state", state: afterE4() });
    await drainBridge();
    expect(test.animator).toHaveBeenCalledTimes(1);
    test.dispose();
  });
  it("replaces the board from a mismatch snapshot before allowing another input", async () => {
    const test = setup();
    test.bridge.submitMove("e2", "e4");
    test.socket.receive({ t: "error", code: "state-version-mismatch", fatal: false, state: afterE4() });
    expect(test.controller.isNetworkReady()).toBe(false);
    await drainBridge();
    expect(test.controller.getSnapshot().fen).toBe(afterE4().fen);
    expect(test.client.hasPendingMove()).toBe(false);
    expect(test.animator).not.toHaveBeenCalled();
    test.dispose();
  });
  it("releases a rejected move against canonical state and gives the next intent a new UUID", async () => {
    const test = setup();
    test.bridge.submitMove("e2", "e5");
    const rejected = test.socket.sent[1];
    test.socket.receive({ t: "error", code: "illegal-move", fatal: false });
    expect(test.controller.isNetworkReady()).toBe(false);
    await drainBridge();
    expect(test.controller.getSnapshot().fen).toBe(START_FEN);
    expect(test.controller.isNetworkReady()).toBe(true);
    expect(test.bridge.submitMove("e2", "e4")).toBe(true);
    expect(test.socket.sent[2].requestId).not.toBe(rejected.requestId);
    expect(test.socket.sent[2].expectedVersion).toBe(1);
    test.dispose();
  });
  it("serializes duplicate snapshots arriving while an animation is unresolved", async () => {
    const test = setup();
    let finish!: () => void;
    test.animator.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    test.bridge.submitMove("e2", "e4");
    test.socket.receive({ t: "state", state: afterE4() });
    await drainBridge();
    test.socket.receive({ t: "state", state: afterE4() });
    expect(test.animator).toHaveBeenCalledTimes(1);
    expect(test.controller.isNetworkReady()).toBe(false);
    finish();
    await drainBridge();
    expect(test.animator).toHaveBeenCalledTimes(1);
    expect(test.controller.getSnapshot().fen).toBe(afterE4().fen);
    expect(test.controller.isNetworkReady()).toBe(true);
    test.dispose();
  });
  it("opens completed matches at the final position with control disabled", async () => {
    clientEnvironment();
    const state: DurableGameState = { ...afterE4(), status: "complete", over: true, result: { winner: null, reason: "draw" } };
    const { client } = connectHost(state);
    const controller = new GameController();
    const bridge = new OnlineBridge(client, controller, { onResync: vi.fn(), onNotice: vi.fn() });
    expect(controller.getSnapshot().fen).toBe(state.fen);
    expect(controller.getSnapshot().result).toEqual({ winner: null, reason: "draw" });
    expect(controller.isNetworkReady()).toBe(false);
    expect(bridge.submitMove("e2", "e4")).toBe(false);
    bridge.dispose(); client.dispose(); controller.stop();
  });
  it("never reopens control after seat replacement or a queued snapshot", async () => {
    const test = setup();
    test.socket.receive({ t: "state", state: afterE4() });
    test.socket.receive({ t: "error", code: "seat-replaced", fatal: true });
    await drainBridge();
    expect(test.controller.isNetworkReady()).toBe(false);
    expect(test.bridge.submitMove("e2", "e4")).toBe(false);
    test.dispose();
  });
  it("locks input on disconnect and resumes at the canonical position without replaying old moves", async () => {
    const test = setup();
    test.socket.close();
    expect(test.controller.isNetworkReady()).toBe(false);
    vi.advanceTimersByTime(500);
    const retry = TestSocket.instances[1];
    retry.open();
    retry.receive({ t: "seated", seat: "host", color: "w", state: afterE4() });
    await drainBridge();
    expect(test.controller.getSnapshot().fen).toBe(afterE4().fen);
    expect(test.animator).not.toHaveBeenCalled();
    test.dispose();
  });
});
