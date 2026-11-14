import { useState } from "react";
import { Check, Copy, Home, Swords } from "lucide-react";

import type { EndReason, Faction, GameResult } from "../core/types";
import { Crest, FACTION_NAMES } from "./Heraldry";

interface GameOverModalProps {
  result: GameResult;
  pgn: string;
  playerColor: Faction;
  versusComputer: boolean;
  onRematch: () => void;
  onMenu: () => void;
}

const REASON_COPY: Record<EndReason, string> = {
  checkmate: "Checkmate — The enemy sovereign has fallen",
  stalemate: "Stalemate — No legal command remains",
  resignation: "The standard was conceded",
  timeout: "The hourglass ran dry",
  threefold: "Threefold repetition of the battle lines",
  insufficient: "Insufficient forces to force an outcome",
  fiftymove: "Fifty-move deadlock rule",
  draw: "An honorable draw agreed upon",
};

export function GameOverModal({ result, pgn, playerColor, versusComputer, onRematch, onMenu }: GameOverModalProps) {
  const [copied, setCopied] = useState(false);

  const draw = result.winner === null;
  const playerWon = versusComputer && result.winner === playerColor;
  const headline = draw
    ? "BATTLE DRAWN"
    : playerWon
      ? "VICTORY ACHIEVED"
      : versusComputer
        ? "DEFEAT"
        : result.winner === "w"
          ? "THE EMBER COURT PREVAILS"
          : "THE HOLLOW LEGION CLAIMS THE THRONE";

  const copyPgn = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(pgn);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.warn("[ui] clipboard unavailable", error);
    }
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-black/75 px-5 backdrop-blur-md">
      <div className="mc-slate mc-goldleaf mc-rise w-full max-w-md overflow-hidden p-6 sm:p-7 shadow-2xl">
        <div className="text-center">
          <div className="flex justify-center gap-3">
            {result.winner ? (
              <Crest faction={result.winner} size={48} active />
            ) : (
              <>
                <Crest faction="w" size={36} />
                <Crest faction="b" size={36} />
              </>
            )}
          </div>

          <h2 className="mc-display mt-4 text-2xl sm:text-3xl font-bold tracking-[0.12em] text-[#fbf0d8]">{headline}</h2>
          <div className="mc-rule mx-auto mt-2 w-48 opacity-80" />
          <p className="mt-2 text-xs italic text-[#c5b28d]">{REASON_COPY[result.reason]}</p>

          {result.winner && (
            <p className="mt-1 text-[0.7rem] uppercase tracking-wider text-[#e0a852] font-semibold">
              Victor: {FACTION_NAMES[result.winner]}
            </p>
          )}

          <div className="mt-4 max-h-28 overflow-y-auto rounded border border-[#8a652255] bg-[#00000040] p-3 text-left font-mono text-[0.7rem] leading-relaxed text-[#cbbba0]">
            {pgn.length > 0 ? pgn : "1. (no moves recorded)"}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button type="button" className="mc-btn mc-btn-primary flex items-center justify-center gap-2 py-3 text-xs sm:text-sm font-bold" onClick={onRematch}>
              <Swords size={16} /> New Battle
            </button>
            <button type="button" className="mc-btn flex items-center justify-center gap-2 py-3 text-xs sm:text-sm" onClick={onMenu}>
              <Home size={16} /> Ashen Throne Menu
            </button>
          </div>
          <button
            type="button"
            className="mc-btn mt-2.5 flex w-full items-center justify-center gap-2 py-2 text-xs text-[#a69575]"
            onClick={() => void copyPgn()}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied PGN" : "Copy Battle Record (PGN)"}
          </button>
        </div>
      </div>
    </div>
  );
}
