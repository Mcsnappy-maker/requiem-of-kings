import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Globe, Loader2, X } from "lucide-react";
import type { Faction } from "../core/types";
import {
  OnlineClient,
  relayAvailable,
  type ConnectionStatus,
  type HostedMatch,
} from "../net/onlineClient";
import { clearPrivateFragment, readPrivateIntent } from "../net/privateLink";
import type { SeatPreference } from "../net/protocol";
import { Crest } from "./Heraldry";

export interface OnlineSession {
  client: OnlineClient;
  matchId: string;
  color: Faction;
}
interface OnlineLobbyProps {
  onSeated: (session: OnlineSession) => void;
  onClose: () => void;
}

export function onlineFailureCopy(code: string): string {
  switch (code) {
    case "seat-replaced":
      return "This seat opened on another device";
    case "join-consumed":
      return "This invite has expired or already been used. Ask your opponent for a new invite.";
    case "match-expired":
    case "no-match":
      return "This room has expired. Create a new duel.";
    case "bad-token":
    case "bad-message":
    case "private-link-required":
      return "This private link is invalid. Check that you opened the complete link.";
    case "bad-version":
      return "This client is incompatible. Update the game and reopen your private link.";
    case "configuration":
      return "Online play is unavailable in this build.";
    default:
      return "Could not connect to this duel. Try reopening your private return link.";
  }
}

export function PrivateLinkActions({
  returnLink,
  joinLink,
  guest = false,
}: {
  returnLink: string | null;
  joinLink?: string;
  guest?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState<string | null>(null);
  const copy = async (link: string) => {
    setCopied(false);
    setFallback(null);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setFallback(link);
    }
  };
  return (
    <div className="space-y-3">
      {joinLink ? (
        <button
          type="button"
          className="mc-btn flex w-full items-center justify-center gap-2 py-3"
          onClick={() => void copy(joinLink)}
        >
          <Copy size={15} />
          Copy opponent invite
        </button>
      ) : null}
      {returnLink ? (
        <button
          type="button"
          className="mc-btn flex w-full items-center justify-center gap-2 py-3"
          onClick={() => void copy(returnLink)}
        >
          <Copy size={15} />
          {guest ? "Save my return link" : "Copy my return link"}
        </button>
      ) : null}
      <p className="text-xs leading-relaxed text-[#d9c489]">
        Anyone with your private return link controls your seat. Keep it private
        and save it to return on another device. Share only the opponent invite.
      </p>
      {copied ? (
        <p role="status" className="text-xs text-[#b7a88a]">
          Link copied
        </p>
      ) : null}
      {fallback ? (
        <label className="block text-xs text-[#d9c489]">
          Clipboard unavailable. Select and copy this link.
          <textarea
            aria-label="Private link to copy"
            className="mc-input mt-2 w-full select-text px-3 py-2"
            readOnly
            value={fallback}
            onFocus={(event) => event.currentTarget.select()}
            onClick={(event) => event.currentTarget.select()}
          />
        </label>
      ) : null}
    </div>
  );
}

function readStoredName(): string {
  try {
    return localStorage.getItem("kg.online.name") ?? "";
  } catch {
    return "";
  }
}

export function OnlineLobby({ onSeated, onClose }: OnlineLobbyProps) {
  const intent = useMemo(() => readPrivateIntent(window.location), []);
  const [tab, setTab] = useState<"host" | "join">(intent ? "join" : "host");
  const [name, setName] = useState(readStoredName);
  const [seat, setSeat] = useState<SeatPreference>("random");
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(() =>
    window.location.hash && !intent ? onlineFailureCopy("bad-token") : null,
  );
  const [hosted, setHosted] = useState<HostedMatch | null>(null);
  const [confirmed, setConfirmed] = useState<OnlineSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [client] = useState(() => new OnlineClient());
  // The lobby owns this connection until Enter duel transfers it to the shell.
  const transferred = useRef(false);
  const mounted = useRef(true);
  const noService = !relayAvailable();

  useEffect(() => {
    mounted.current = true;
    const offStatus = client.on("status", ({ status }) => setStatus(status));
    const offSeated = client.on("seated", ({ matchId, color }) => {
      setConfirmed({ client, matchId, color });
      setBusy(false);
      setError(null);
    });
    const offFailed = client.on("failed", ({ code, fatal }) => {
      setBusy(false);
      if (fatal) setFatal(onlineFailureCopy(code));
      else setError("Could not connect. Please try again.");
    });
    if (intent?.kind === "seat") {
      setBusy(true);
      if (!client.resume(intent)) {
        setBusy(false);
        setFatal((failure) => failure ?? onlineFailureCopy("bad-token"));
      }
    }
    return () => {
      mounted.current = false;
      offStatus();
      offSeated();
      offFailed();
      if (!transferred.current) client.dispose();
    };
  }, [client, intent]);

  const close = useCallback(() => {
    clearPrivateFragment(window.history, window.location);
    client.dispose();
    onClose();
  }, [client, onClose]);
  const host = async () => {
    setBusy(true);
    setError(null);
    try {
      const match = await client.host(name.trim() || "Challenger", seat);
      if (mounted.current) {
        setHosted(match);
        setBusy(false);
      }
    } catch {
      if (mounted.current) {
        setBusy(false);
        setError("Could not create a duel. Please try again.");
      }
    }
  };
  const join = () => {
    if (intent?.kind !== "join") return;
    setBusy(true);
    setError(null);
    client.claim(intent, name.trim() || "Challenger");
  };
  const enter = () => {
    if (confirmed) {
      transferred.current = true;
      onSeated(confirmed);
    }
  };
  return (
    <div className="mc-menu pointer-events-auto absolute inset-0 z-30 flex flex-col items-center justify-center overflow-hidden px-5 py-6">
      <div className="mc-slate mc-goldleaf mc-rise flex max-h-full w-full min-h-0 max-w-md flex-col overflow-y-auto p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="mc-display flex items-center gap-2 text-sm tracking-[0.28em] text-[#f0dfb6]">
            <Globe size={15} /> ONLINE DUEL
          </h2>
          <button
            type="button"
            className="mc-chip px-2 py-1.5"
            onClick={close}
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
        {fatal ? (
          <div className="space-y-4">
            <p role="alert" className="text-sm text-[#d98a6a]">
              {fatal}
            </p>
            <button
              type="button"
              className="mc-btn w-full py-3"
              onClick={close}
            >
              Back to main menu
            </button>
          </div>
        ) : (
          <>
            {noService ? (
              <p className="mb-3 text-xs text-[#d9c489]">
                Online play is unavailable in this build. Computer and 2 Players
                are available from the main menu.
              </p>
            ) : null}
            <p className="mb-4 text-sm text-[#b7a88a]">Untimed</p>
            {hosted || confirmed ? (
              <div className="space-y-4">
                <p className="mc-display text-xs text-[#a89268]">
                  HALL {hosted?.matchId ?? confirmed?.matchId}
                </p>
                <PrivateLinkActions
                  joinLink={hosted?.joinLink}
                  returnLink={client.getReturnLink()}
                  guest={intent?.kind === "join"}
                />
                {confirmed ? (
                  <>
                    <p className="flex items-center gap-2 text-sm text-[#b7a88a]">
                      <Crest faction={confirmed.color} size={18} active />
                      You command the{" "}
                      {confirmed.color === "w" ? "Ivory" : "Obsidian"} army
                    </p>
                    <button
                      type="button"
                      className="mc-btn mc-btn-primary w-full py-3"
                      onClick={enter}
                    >
                      Enter duel
                    </button>
                  </>
                ) : null}
                {hosted ? (
                  <p className="text-xs italic text-[#9c8b6c]">
                    Your opponent can join using the invite. You can enter the
                    board while you wait.
                  </p>
                ) : null}
              </div>
            ) : (
              <>
                {!intent ? (
                  <div className="mb-5 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className="mc-chip py-3"
                      data-active={tab === "host"}
                      onClick={() => setTab("host")}
                    >
                      Host
                    </button>
                    <button
                      type="button"
                      className="mc-chip py-3"
                      data-active={tab === "join"}
                      onClick={() => setTab("join")}
                    >
                      Join
                    </button>
                  </div>
                ) : null}
                {intent?.kind === "seat" ? (
                  <p className="text-sm text-[#b7a88a]">
                    Restoring your seat...
                  </p>
                ) : (
                  <div className="space-y-5">
                    <label className="block text-xs text-[#a89268]">
                      Your name (optional)
                      <input
                        className="mc-input mt-2 w-full px-3 py-2.5 text-sm"
                        value={name}
                        maxLength={20}
                        placeholder="Challenger"
                        onChange={(event) => {
                          setName(event.target.value);
                          try {
                            localStorage.setItem(
                              "kg.online.name",
                              event.target.value,
                            );
                          } catch {
                            /* restricted storage */
                          }
                        }}
                      />
                    </label>
                    {tab === "host" ? (
                      <div>
                        <p className="mb-2 text-xs text-[#a89268]">
                          Your banner
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          {(["w", "b", "random"] as SeatPreference[]).map(
                            (option) => (
                              <button
                                key={option}
                                type="button"
                                className="mc-chip py-2.5"
                                data-active={seat === option}
                                onClick={() => setSeat(option)}
                              >
                                {option === "w"
                                  ? "Ivory"
                                  : option === "b"
                                    ? "Obsidian"
                                    : "Random"}
                              </button>
                            ),
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-[#b7a88a]">
                        {intent?.kind === "join"
                          ? "Your opponent invited you to a private duel."
                          : "Open the private opponent invite to join a duel. A hall label alone cannot claim a seat."}
                      </p>
                    )}
                    <button
                      type="button"
                      className="mc-btn mc-btn-primary flex w-full items-center justify-center gap-2 py-3.5 disabled:opacity-50"
                      disabled={
                        noService ||
                        busy ||
                        (tab === "join" && intent?.kind !== "join")
                      }
                      onClick={tab === "host" ? () => void host() : join}
                    >
                      {busy ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Connecting...
                        </>
                      ) : tab === "host" ? (
                        "Open a hall"
                      ) : (
                        "Join duel"
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
            {error ? (
              <p role="alert" className="mt-4 text-xs text-[#d98a6a]">
                {error}
              </p>
            ) : null}
            {status === "connecting" || status === "reconnecting" ? (
              <p role="status" className="mt-4 text-xs text-[#9c8b6c]">
                {status === "reconnecting"
                  ? "Reconnecting and restoring the board..."
                  : "Connecting..."}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
