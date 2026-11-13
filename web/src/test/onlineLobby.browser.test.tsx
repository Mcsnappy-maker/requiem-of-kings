import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render, cleanup } from "vitest-browser-react";
import { OnlineLobby } from "@/ui/OnlineLobby";
import { GameShell } from "@/ui/GameShell";
import type { DurableGameState } from "@/net/protocol";
import "@/index.css";

const renderer = vi.hoisted(() => ({
  controller: null as import("@/core/gameController").GameController | null,
  interactive: false,
}));
vi.mock("@/scene/sceneEngine", () => ({
  SceneEngine: class {
    constructor(
      _canvas: unknown,
      controller: import("@/core/gameController").GameController,
      handlers: { onReady: () => void },
    ) {
      renderer.controller = controller;
      return new Proxy(this, {
        get: (_target, key) => {
          if (key === "load") return async () => handlers.onReady();
          if (key === "setInteractive")
            return (value: boolean) => {
              renderer.interactive = value;
            };
          return () => {};
        },
      });
    }
  },
}));
vi.mock("@/audio/audioManager", () => ({
  audio: { unlock: async () => {}, setMuted: () => {}, blip: () => {} },
}));

const id = "11111111-2222-4333-8444-555555555555";
const hostToken = "host_private_credential_1234567890";
const joinToken = "join_private_credential_1234567890";
const guestToken = "guest_private_credential_123456789";
const initialFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const state = (active = false): DurableGameState => ({
  matchId: id,
  status: active ? "active" : "waiting",
  fen: initialFen,
  moves: [],
  stateVersion: active ? 1 : 0,
  turn: "w",
  started: active,
  over: false,
  result: null,
  players: active
    ? [
        { color: "w", name: "Host" },
        { color: "b", name: "Guest" },
      ]
    : [{ color: "w", name: "Host" }],
});
class Socket {
  static instances: Socket[] = [];
  static OPEN = 1;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: unknown[] = [];
  constructor(public url: string) {
    Socket.instances.push(this);
  }
  send(value: string) {
    this.sent.push(JSON.parse(value));
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
}
const fragment = (
  kind: "join" | "seat",
  token = kind === "join" ? joinToken : hostToken,
) => `#match=${id}&${kind}=${token}`;
const pageUrl = () => `${window.location.origin}${window.location.pathname}`;
let clipboard: ReturnType<typeof vi.fn<(data: string) => Promise<void>>>;
beforeEach(() => {
  window.history.replaceState(null, "", window.location.pathname);
  localStorage.clear();
  Socket.instances = [];
  vi.stubEnv("VITE_MULTIPLAYER_HTTP_URL", "https://matches.example");
  vi.stubEnv("VITE_MULTIPLAYER_WS_URL", "wss://socket.example");
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ matchId: id, hostToken, joinToken, state: state() }),
          { status: 201 },
        ),
    ),
  );
  clipboard = vi.fn(async () => {});
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(clipboard);
});
afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.history.replaceState(null, "", window.location.pathname);
});
async function openJoin() {
  window.history.replaceState(null, "", fragment("join"));
  const onSeated = vi.fn();
  const screen = await render(
    <OnlineLobby onSeated={onSeated} onClose={() => {}} />,
  );
  await screen.getByRole("button", { name: "Join duel", exact: true }).click();
  const socket = Socket.instances[0];
  socket.open();
  return { screen, socket, onSeated };
}

test("Online Duel offers only Untimed and hosts separate opponent and private return links", async () => {
  const screen = await render(
    <OnlineLobby onSeated={() => {}} onClose={() => {}} />,
  );
  await expect
    .element(screen.getByText("Untimed", { exact: true }))
    .toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /5 min|10 min|15 min/ }).all(),
  ).toHaveLength(0);
  await screen
    .getByRole("textbox", { name: "Your name (optional)" })
    .fill("Host");
  await screen.getByRole("button", { name: "Ivory", exact: true }).click();
  await screen.getByRole("button", { name: "Open a hall" }).click();
  await expect
    .element(screen.getByRole("button", { name: "Copy opponent invite" }))
    .toBeInTheDocument();
  await screen.getByRole("button", { name: "Copy opponent invite" }).click();
  await screen.getByRole("button", { name: "Copy my return link" }).click();
  expect(clipboard.mock.calls.map((call) => call[0])).toEqual([
    `${pageUrl()}${fragment("join")}`,
    `${pageUrl()}${fragment("seat")}`,
  ]);
  const request = JSON.parse(
    (vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string,
  );
  expect(request).toEqual({ v: 2, name: "Host", color: "w" });
  await expect
    .element(
      screen.getByText(
        /Anyone with your private return link controls your seat/,
      ),
    )
    .toBeInTheDocument();
});

test("join fragment selects Join, claims once, clears credentials and offers guest return link", async () => {
  const { screen, socket, onSeated } = await openJoin();
  expect(socket.sent).toEqual([
    { t: "claim", v: 2, token: joinToken, name: "Challenger" },
  ]);
  socket.receive({
    t: "seated",
    seat: "guest",
    color: "b",
    seatToken: guestToken,
    state: state(true),
  });
  await expect
    .element(screen.getByRole("button", { name: "Save my return link" }))
    .toBeInTheDocument();
  expect(window.location.hash).toBe("");
  expect(localStorage.getItem(`rok.online.seats.${id}`)).toContain(guestToken);
  expect(localStorage.getItem(`rok.online.seats.${id}`)).not.toContain(
    joinToken,
  );
  await screen.getByRole("button", { name: "Save my return link" }).click();
  expect(clipboard).toHaveBeenCalledWith(
    `${pageUrl()}${fragment("seat", guestToken)}`,
  );
  await screen.getByRole("button", { name: "Enter duel" }).click();
  expect(onSeated).toHaveBeenCalledOnce();
  onSeated.mock.calls[0][0].client.dispose();
});

test("a return fragment resumes automatically without requesting a room code", async () => {
  window.history.replaceState(null, "", fragment("seat"));
  const screen = await render(
    <OnlineLobby onSeated={() => {}} onClose={() => {}} />,
  );
  await vi.waitFor(() => expect(Socket.instances).toHaveLength(1));
  const socket = Socket.instances[0];
  socket.open();
  expect(socket.sent).toEqual([{ t: "resume", v: 2, token: hostToken }]);
  socket.receive({ t: "seated", seat: "host", color: "w", state: state(true) });
  await expect
    .element(screen.getByRole("button", { name: "Enter duel" }))
    .toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /code/i }).all()).toHaveLength(0);
  expect(window.location.hash).toBe("");
});

test.each([
  [
    "join-consumed",
    "This invite has expired or already been used. Ask your opponent for a new invite.",
  ],
  ["match-expired", "This room has expired. Create a new duel."],
  ["no-match", "This room has expired. Create a new duel."],
  [
    "bad-token",
    "This private link is invalid. Check that you opened the complete link.",
  ],
  [
    "bad-version",
    "This client is incompatible. Update the game and reopen your private link.",
  ],
])(
  "%s gives readable fatal feedback and returns to menu without reload",
  async (code, message) => {
    const close = vi.fn();
    window.history.replaceState(null, "", fragment("join"));
    const screen = await render(
      <OnlineLobby onSeated={() => {}} onClose={close} />,
    );
    await screen
      .getByRole("button", { name: "Join duel", exact: true })
      .click();
    const socket = Socket.instances[0];
    socket.open();
    socket.receive({ t: "error", code, fatal: true });
    await expect.element(screen.getByRole("alert")).toHaveTextContent(message);
    await screen.getByRole("button", { name: "Back to main menu" }).click();
    expect(close).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe("");
  },
);

test("malformed private links fail closed even with a hall-code query", async () => {
  window.history.replaceState(null, "", "?room=FQQVR#match=invalid&join=bad");
  const screen = await render(
    <OnlineLobby onSeated={() => {}} onClose={() => {}} />,
  );
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("This private link is invalid");
  expect(Socket.instances).toHaveLength(0);
});

test("a hall-code query cannot claim a seat without a private invite", async () => {
  window.history.replaceState(null, "", "?room=FQQVR");
  const screen = await render(
    <OnlineLobby onSeated={() => {}} onClose={() => {}} />,
  );
  await screen.getByRole("button", { name: "Join", exact: true }).click();
  await expect
    .element(screen.getByRole("button", { name: "Join duel", exact: true }))
    .toBeDisabled();
  expect(screen.getByRole("textbox", { name: /code/i }).all()).toHaveLength(0);
  expect(Socket.instances).toHaveLength(0);
});

test("clipboard rejection displays a selectable private link without logging credentials", async () => {
  clipboard.mockRejectedValue(new Error(joinToken));
  const logs = [
    vi.spyOn(console, "log"),
    vi.spyOn(console, "warn"),
    vi.spyOn(console, "error"),
  ];
  const screen = await render(
    <OnlineLobby onSeated={() => {}} onClose={() => {}} />,
  );
  await screen.getByRole("button", { name: "Open a hall" }).click();
  await screen.getByRole("button", { name: "Copy my return link" }).click();
  const fallback = screen.getByRole("textbox", {
    name: "Private link to copy",
  });
  await expect.element(fallback).toHaveValue(`${pageUrl()}${fragment("seat")}`);
  await fallback.click();
  const input = fallback.element() as HTMLTextAreaElement;
  expect(input.selectionEnd! - input.selectionStart!).toBe(input.value.length);
  expect(logs.every((log) => log.mock.calls.length === 0)).toBe(true);
});

test("seat replacement in the real shell locks board input and offers a persistent route to menu", async () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    {} as WebGLRenderingContext,
  );
  window.history.replaceState(null, "", fragment("join"));
  const screen = await render(<GameShell />);
  await screen.getByRole("button", { name: "Join duel", exact: true }).click();
  const socket = Socket.instances[0];
  socket.open();
  socket.receive({
    t: "seated",
    seat: "guest",
    color: "b",
    seatToken: guestToken,
    state: state(true),
  });
  await screen.getByRole("button", { name: "Enter duel" }).click();
  await vi.waitFor(() =>
    expect(renderer.controller?.isNetworkReady()).toBe(true),
  );
  await screen.getByRole("button", { name: "My private return link" }).click();
  await screen.getByRole("button", { name: "Copy my return link" }).click();
  expect(clipboard).toHaveBeenCalledWith(
    `${pageUrl()}${fragment("seat", guestToken)}`,
  );
  socket.receive({ t: "error", code: "seat-replaced", fatal: true });
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("This seat opened on another device");
  expect(renderer.controller?.isNetworkReady()).toBe(false);
  expect(renderer.interactive).toBe(false);
  await screen.getByRole("button", { name: "Back to main menu" }).click();
  await expect
    .element(screen.getByRole("button", { name: "Online", exact: true }))
    .toBeInTheDocument();
});

test("an unavailable online service keeps its configuration feedback when resuming", async () => {
  vi.stubEnv("VITE_MULTIPLAYER_WS_URL", "");
  window.history.replaceState(null, "", fragment("seat"));
  const screen = await render(
    <OnlineLobby onSeated={() => {}} onClose={() => {}} />,
  );
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("Online play is unavailable in this build.");
  expect(Socket.instances).toHaveLength(0);
});
