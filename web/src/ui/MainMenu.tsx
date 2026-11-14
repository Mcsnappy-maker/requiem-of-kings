import { useState } from "react";
import { Clapperboard, Crown, Globe, Shield, Swords, Settings as SettingsIcon, Users, ChevronDown, ChevronUp } from "lucide-react";

import type { DemoOptions, Difficulty, Faction } from "../core/types";
import { Crest, FACTION_NAMES, FACTION_PIECE_TITLES, FACTION_SUBTITLES } from "./Heraldry";

export interface MatchConfig {
  mode: "ai" | "hotseat" | "demo";
  difficulty: Difficulty;
  playerColor: Faction;
  clockMinutes: number | null;
  demo?: DemoOptions;
}

interface MainMenuProps {
  onStart: (config: MatchConfig) => void;
  /** Opens the private online match journey (invite or saved return link). */
  onPlayOnline: () => void;
  onOpenSettings: () => void;
  attract: boolean;
  onInteract: () => void;
}

const DIFFICULTY_COPY: Record<Difficulty, string> = {
  easy: "Squire — Quick skirmisher, testing the line",
  medium: "Knight Commander — Calculating tactician, looks ahead",
  hard: "Grand Inquisitor — Relentless master, punishes every mistake",
};

const DEMO_SPEEDS: { label: string; value: number }[] = [
  { label: "0.5×", value: 0.5 },
  { label: "1×", value: 1 },
  { label: "2×", value: 2 },
  { label: "4×", value: 4 },
];

const CLOCKS: { label: string; value: number | null }[] = [
  { label: "Untimed", value: null },
  { label: "5 min", value: 5 },
  { label: "10 min", value: 10 },
  { label: "15 min", value: 15 },
];

export function MainMenu({ onStart, onPlayOnline, onOpenSettings, attract, onInteract }: MainMenuProps) {
  const [tab, setTab] = useState<"ai" | "hotseat" | "online" | "demo">("ai");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [playerColor, setPlayerColor] = useState<Faction>("w");
  const [clock, setClock] = useState<number | null>(null);
  const [demoWhite, setDemoWhite] = useState<Difficulty>("medium");
  const [demoBlack, setDemoBlack] = useState<Difficulty>("hard");
  const [demoSpeed, setDemoSpeed] = useState(1);
  const [demoLoop, setDemoLoop] = useState(true);
  const [showRoster, setShowRoster] = useState(false);

  const start = (): void => {
    if (tab === "online") {
      onPlayOnline();
      return;
    }
    onStart({
      mode: tab,
      difficulty,
      playerColor,
      clockMinutes: tab === "demo" ? null : clock,
      demo: tab === "demo" ? { white: demoWhite, black: demoBlack, speed: demoSpeed, autoRematch: demoLoop } : undefined,
    });
  };

  return (
    <div
      className="mc-menu pointer-events-auto absolute inset-0 flex flex-col items-center justify-center overflow-hidden px-5 py-6"
      onPointerDown={onInteract}
      onPointerMove={onInteract}
    >
      <div className="mc-unfurl mc-menu-hero mb-5 min-h-0 shrink text-center">
        <p className="mc-display text-[0.66rem] tracking-[0.45em] text-[#e0a852] uppercase font-semibold">
          A Cinematic Dark-Fantasy Chess Experience
        </p>
        <h1 className="mc-display mc-title-glow mt-1.5 text-4xl font-bold tracking-[0.14em] text-[#fbf0d8] sm:text-6xl">
          REQUIEM OF KINGS
        </h1>
        <div className="mc-rule mx-auto mt-2.5 w-72" />
        <p className="mt-2 text-xs italic text-[#d4be94] sm:text-sm">
          {attract ? "A showcase clash is underway — command the Ashen Throne" : "The Ashen Throne — An eternal war between the Ember Court and the Hollow Legion"}
        </p>
      </div>

      <div className="mc-slate mc-goldleaf mc-rise flex max-h-full w-full min-h-0 max-w-lg flex-col p-5 sm:p-6 shadow-2xl">
        <div className="mb-4 grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            type="button"
            className="mc-chip flex items-center justify-center gap-1.5 px-1 py-3 text-xs sm:text-sm font-semibold"
            data-active={tab === "ai"}
            onClick={() => setTab("ai")}
          >
            <Swords size={15} /> Computer
          </button>
          <button
            type="button"
            className="mc-chip flex items-center justify-center gap-1.5 px-1 py-3 text-xs sm:text-sm font-semibold"
            data-active={tab === "hotseat"}
            onClick={() => setTab("hotseat")}
          >
            <Users size={15} /> 2 Players
          </button>
          <button
            type="button"
            className="mc-chip flex items-center justify-center gap-1.5 px-1 py-3 text-xs sm:text-sm font-semibold"
            data-active={tab === "online"}
            onClick={() => setTab("online")}
          >
            <Globe size={15} /> Online
          </button>
          <button
            type="button"
            className="mc-chip flex items-center justify-center gap-1.5 px-1 py-3 text-xs sm:text-sm font-semibold"
            data-active={tab === "demo"}
            onClick={() => setTab("demo")}
          >
            <Clapperboard size={15} /> Showcase
          </button>
        </div>

        <div className="mc-scroll -mr-2 min-h-0 flex-auto overflow-y-auto pr-2">
          {tab === "ai" ? (
            <div className="mc-fade space-y-4">
              <div>
                <p className="mc-display mb-1.5 text-[0.62rem] tracking-[0.3em] text-[#a89268] uppercase">Opponent Difficulty</p>
                <div className="grid grid-cols-3 gap-2">
                  {(["easy", "medium", "hard"] as Difficulty[]).map((level) => (
                    <button
                      key={level}
                      type="button"
                      className="mc-chip py-2 capitalize font-semibold"
                      data-active={difficulty === level}
                      onClick={() => setDifficulty(level)}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs italic text-[#9c8b6c]">{DIFFICULTY_COPY[difficulty]}</p>
              </div>

              <div>
                <p className="mc-display mb-1.5 text-[0.62rem] tracking-[0.3em] text-[#a89268] uppercase">Choose Your Faction</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["w", "b"] as Faction[]).map((color) => (
                    <button
                      key={color}
                      type="button"
                      className="mc-chip flex items-center justify-center gap-2 py-3 px-2 text-left"
                      data-active={playerColor === color}
                      onClick={() => setPlayerColor(color)}
                    >
                      <Crest faction={color} size={22} active={playerColor === color} />
                      <div className="min-w-0">
                        <span className="block text-xs sm:text-sm font-bold text-[#f2e6cf] truncate">
                          {color === "w" ? "The Ember Court" : "The Hollow Legion"}
                        </span>
                        <span className="block text-[0.62rem] text-[#b39e76] italic truncate">
                          {color === "w" ? "Blackened Steel" : "Spectral Obsidian"}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : tab === "hotseat" ? (
            <div className="mc-fade space-y-3">
              <p className="text-sm italic leading-relaxed text-[#cbbba0]">
                Two commanders, one shared screen. Take turns commanding the Ember Court and the Hollow Legion.
              </p>
              <div className="rounded border border-[#8a652233] bg-[#0c0d1277] p-3 text-xs leading-relaxed text-[#9f9175]">
                Capturing another piece triggers a cinematic combat duel. Turn rotation and camera pacing can be adjusted in Settings.
              </div>
            </div>
          ) : tab === "online" ? (
            <div className="mc-fade space-y-3">
              <p className="text-sm italic leading-relaxed text-[#cbbba0]">
                Duel across phone, tablet, or computer. Create a private match and share the one-time opponent invite.
              </p>
              <p className="text-xs italic leading-relaxed text-[#9c8b6c]">
                Each player receives a private return link, so either commander can leave and continue later from another device.
              </p>
            </div>
          ) : (
            <div className="mc-fade space-y-4">
              <p className="text-sm italic leading-relaxed text-[#cbbba0]">
                Two AI engines clash in the Ashen Throne while the cinematic camera frames the battles. Press{" "}
                <span className="mc-display text-[#e2c98f]">C</span> to toggle interface visibility.
              </p>

              <div>
                <p className="mc-display mb-1.5 text-[0.62rem] tracking-[0.3em] text-[#a89268] uppercase">Ember Court Strength</p>
                <div className="grid grid-cols-3 gap-2">
                  {(["easy", "medium", "hard"] as Difficulty[]).map((level) => (
                    <button
                      key={level}
                      type="button"
                      className="mc-chip py-2 capitalize font-semibold"
                      data-active={demoWhite === level}
                      onClick={() => setDemoWhite(level)}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mc-display mb-1.5 text-[0.62rem] tracking-[0.3em] text-[#a89268] uppercase">Hollow Legion Strength</p>
                <div className="grid grid-cols-3 gap-2">
                  {(["easy", "medium", "hard"] as Difficulty[]).map((level) => (
                    <button
                      key={level}
                      type="button"
                      className="mc-chip py-2 capitalize font-semibold"
                      data-active={demoBlack === level}
                      onClick={() => setDemoBlack(level)}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mc-display mb-1.5 text-[0.62rem] tracking-[0.3em] text-[#a89268] uppercase">Pace</p>
                <div className="grid grid-cols-4 gap-2">
                  {DEMO_SPEEDS.map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      className="mc-chip py-2 font-semibold"
                      data-active={demoSpeed === option.value}
                      onClick={() => setDemoSpeed(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                className="mc-chip flex w-full items-center justify-between px-3 py-2.5"
                data-active={demoLoop}
                onClick={() => setDemoLoop((loop) => !loop)}
                aria-pressed={demoLoop}
              >
                <span className="text-xs">Continuous Rematches</span>
                <span className="mc-display text-[0.62rem] tracking-[0.24em] font-bold">{demoLoop ? "ON" : "OFF"}</span>
              </button>
            </div>
          )}

          {tab === "demo" || tab === "online" ? null : (
            <div className="mt-4">
              <p className="mc-display mb-1.5 text-[0.62rem] tracking-[0.3em] text-[#a89268] uppercase">Hourglass Clock</p>
              <div className="grid grid-cols-4 gap-2">
                {CLOCKS.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    className="mc-chip py-2 text-xs font-semibold"
                    data-active={clock === option.value}
                    onClick={() => setClock(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Faction Heroes Preview Expander */}
          <div className="mt-4 border-t border-[#8a652233] pt-3">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left text-xs text-[#c4b189] hover:text-[#f2e6cf]"
              onClick={() => setShowRoster((v) => !v)}
            >
              <span className="mc-display flex items-center gap-1.5 text-[0.65rem] tracking-[0.2em] uppercase">
                <Shield size={12} /> Faction Hero Classes
              </span>
              {showRoster ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showRoster && (
              <div className="mt-2.5 space-y-3 rounded bg-[#00000040] p-3 text-[0.72rem]">
                <div>
                  <div className="flex items-center gap-1.5 font-bold text-[#ff9147]">
                    <Crest faction="w" size={14} active />
                    <span>{FACTION_NAMES.w}</span>
                  </div>
                  <p className="text-[0.62rem] italic text-[#a38c64] mb-1">{FACTION_SUBTITLES.w}</p>
                  <ul className="grid grid-cols-2 gap-1 text-[#e1cfad]">
                    <li>• King: {FACTION_PIECE_TITLES.w.k}</li>
                    <li>• Queen: {FACTION_PIECE_TITLES.w.q}</li>
                    <li>• Bishop: {FACTION_PIECE_TITLES.w.b}</li>
                    <li>• Knight: {FACTION_PIECE_TITLES.w.n}</li>
                    <li>• Rook: {FACTION_PIECE_TITLES.w.r}</li>
                    <li>• Pawn: {FACTION_PIECE_TITLES.w.p}</li>
                  </ul>
                </div>
                <div className="border-t border-[#8a652222] pt-2">
                  <div className="flex items-center gap-1.5 font-bold text-[#c084fc]">
                    <Crest faction="b" size={14} active />
                    <span>{FACTION_NAMES.b}</span>
                  </div>
                  <p className="text-[0.62rem] italic text-[#9073a3] mb-1">{FACTION_SUBTITLES.b}</p>
                  <ul className="grid grid-cols-2 gap-1 text-[#d6c7ea]">
                    <li>• King: {FACTION_PIECE_TITLES.b.k}</li>
                    <li>• Queen: {FACTION_PIECE_TITLES.b.q}</li>
                    <li>• Bishop: {FACTION_PIECE_TITLES.b.b}</li>
                    <li>• Knight: {FACTION_PIECE_TITLES.b.n}</li>
                    <li>• Rook: {FACTION_PIECE_TITLES.b.r}</li>
                    <li>• Pawn: {FACTION_PIECE_TITLES.b.p}</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mc-panel-foot shrink-0 pt-3">
          <button
            type="button"
            className="mc-btn mc-btn-primary flex w-full items-center justify-center gap-2 py-3 text-sm font-bold tracking-wider"
            onClick={start}
          >
            {tab === "demo" ? (
              <>
                <Clapperboard size={16} /> ENTER SHOWCASE
              </>
            ) : tab === "online" ? (
              <>
                <Globe size={16} /> ENTER LOBBY
              </>
            ) : (
              <>
                <Crown size={16} /> ENTER THE ASHEN THRONE
              </>
            )}
          </button>

          <button
            type="button"
            className="mc-btn mt-2 flex w-full items-center justify-center gap-2 py-2 text-xs"
            onClick={onOpenSettings}
          >
            <SettingsIcon size={14} /> Settings & Accessibility
          </button>
        </div>
      </div>

      <p className="mc-menu-hint mt-4 shrink-0 text-[0.66rem] tracking-[0.2em] text-[#7d6f57]">
        DRAG TO ORBIT · SCROLL TO ZOOM · CLICK A CHARACTER TO COMMAND
      </p>
    </div>
  );
}
