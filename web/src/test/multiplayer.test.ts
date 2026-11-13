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
