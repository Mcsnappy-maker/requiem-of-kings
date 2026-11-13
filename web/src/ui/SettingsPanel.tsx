import { X } from "lucide-react";

import { ARENA_LOOKS, ARENA_ORDER, type ArenaTheme } from "../scene/arena";
import { ERAS, ERA_ORDER, type EraId } from "../scene/eras";
import type { QualityPreset } from "../scene/quality";

export type CinematicIntensity = "full" | "short" | "skip";

export interface GameSettings {
  quality: QualityPreset;
  /** Historical era - decides the armies and their default battleground. */
  era: EraId;
  /** Which map the board is staged in. */
  arena: ArenaTheme;
  captureCinematics: boolean;
  cinematicIntensity: CinematicIntensity;
  reducedMotion: boolean;
  reducedFlashing: boolean;
  rotateBoard: boolean;
  /** Floating rank crests over every figure. */
  rankBadges: boolean;
  muted: boolean;
}

interface SettingsPanelProps {
  settings: GameSettings;
  autoDetected: QualityPreset;
  fps: number;
  /** True when the player pinned a preset by hand (auto step-down disarmed). */
  qualityPinned: boolean;
  onChange: (settings: GameSettings) => void;
  /** Explicit Graphics chip click - pins the preset. */
  onPickQuality: (preset: QualityPreset) => void;
  /** Re-arm the adaptive guard and return to the detected preset. */
  onResetQualityAuto: () => void;
  onClose: () => void;
}

const PRESETS: { key: QualityPreset; label: string; note: string }[] = [
  { key: "low", label: "Low", note: "No post-processing, no shadows — maximum performance" },
  { key: "medium", label: "Medium", note: "Bloom, dynamic shadows, cathedral light shafts" },
  { key: "high", label: "High", note: "Volumetric effects, color grading, 2K shadow maps" },
  { key: "ultra", label: "Ultra", note: "Full post-processing, 4K shadow maps, dense ember particles" },
];

const CINEMATIC_MODES: { key: CinematicIntensity; label: string; note: string }[] = [
  { key: "full", label: "Full Spectacle", note: "Complete cinematic combat with camera cuts & finishers" },
  { key: "short", label: "Accelerated", note: "Fast-paced battle camera punch and quick strike" },
  { key: "skip", label: "Skip Combat", note: "Immediate piece capture resolution with no camera delay" },
];

export function SettingsPanel({
  settings,
  autoDetected,
  fps,
  qualityPinned,
  onChange,
  onPickQuality,
  onResetQualityAuto,
  onClose,
}: SettingsPanelProps) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex flex-col items-center justify-center overflow-hidden bg-black/65 px-5 py-6 backdrop-blur-sm">
      <div className="mc-slate mc-goldleaf mc-rise flex max-h-full w-full min-h-0 max-w-lg flex-col p-5 sm:p-6 shadow-2xl">
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <h2 className="mc-display text-lg text-[#f2e2bd] font-bold">Settings & Accessibility</h2>
          <button type="button" className="mc-btn mc-icon-btn" onClick={onClose} aria-label="Close settings">
            <X size={16} />
          </button>
        </div>

        <div className="mc-scroll mc-scroll-shade -mr-2 min-h-0 flex-auto overflow-y-auto pb-1 pr-2">
          {/* Era & Campaign */}
          <p className="mc-display mb-2 text-[0.6rem] tracking-[0.3em] text-[#a89268] uppercase font-semibold">Active Faction Era</p>
          <div className="grid grid-cols-2 gap-2">
            {ERA_ORDER.map((era) => (
              <button
                key={era}
                type="button"
                className="mc-arena-card text-left"
                data-active={settings.era === era}
                title={ERAS[era].note}
                onClick={() =>
                  onChange({
                    ...settings,
                    era,
                    arena: ERAS[era].arena,
                  })
                }
              >
                <span className="mc-arena-swatch" data-arena={ERAS[era].arena} />
                <span className="mc-display block text-[0.68rem] font-bold leading-tight text-[#f0e0be]">{ERAS[era].label}</span>
                <span className="block text-[0.6rem] leading-tight text-[#9c8b6c] italic">{ERAS[era].period}</span>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs italic text-[#9c8b6c]">
            {ERAS[settings.era].armies.w} vs {ERAS[settings.era].armies.b}
          </p>

          <div className="mc-rule my-4" />

          {/* Battleground */}
          <p className="mc-display mb-2 text-[0.6rem] tracking-[0.3em] text-[#a89268] uppercase font-semibold">Battleground Map</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ARENA_ORDER.map((theme) => (
              <button
                key={theme}
                type="button"
                className="mc-arena-card text-left"
                data-active={settings.arena === theme}
                onClick={() => onChange({ ...settings, arena: theme })}
              >
                <span className="mc-arena-swatch" data-arena={theme} />
                <span className="mc-display block text-[0.68rem] font-bold leading-tight text-[#f0e0be]">{ARENA_LOOKS[theme].label}</span>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs italic text-[#9c8b6c]">{ARENA_LOOKS[settings.arena].note}</p>

          <div className="mc-rule my-4" />

          {/* Graphics Quality */}
          <p className="mc-display mb-2 text-[0.6rem] tracking-[0.3em] text-[#a89268] uppercase font-semibold">Graphics Preset</p>
          <div className="grid grid-cols-4 gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                className="mc-chip py-2 font-semibold text-xs capitalize"
                data-active={settings.quality === preset.key}
                onClick={() => onPickQuality(preset.key)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs italic text-[#9c8b6c]">
            {PRESETS.find((preset) => preset.key === settings.quality)?.note}
          </p>
          <p className="mt-1 text-[0.68rem] text-[#7d6f57]">
            Auto-detected: <span className="text-[#c8ab74] font-semibold">{autoDetected}</span>
            {fps > 0 ? ` · ${fps} FPS` : ""}
          </p>
          {qualityPinned ? (
            <p className="mt-1 text-[0.68rem] text-[#c8ab74]">
              Preset locked by user.{" "}
              <button
                type="button"
                className="underline decoration-dotted underline-offset-2"
                onClick={onResetQualityAuto}
              >
                Reset to automatic
              </button>
            </p>
          ) : null}

          <div className="mc-rule my-4" />

          {/* Cinematic Combat System */}
          <p className="mc-display mb-2 text-[0.6rem] tracking-[0.3em] text-[#a89268] uppercase font-semibold">Cinematic Combat System</p>
          <div className="grid grid-cols-3 gap-2">
            {CINEMATIC_MODES.map((mode) => (
              <button
                key={mode.key}
                type="button"
                className="mc-chip py-2 text-xs font-semibold"
                data-active={settings.cinematicIntensity === mode.key}
                onClick={() =>
                  onChange({
                    ...settings,
                    cinematicIntensity: mode.key,
                    captureCinematics: mode.key !== "skip",
                  })
                }
              >
                {mode.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs italic text-[#9c8b6c]">
            {CINEMATIC_MODES.find((m) => m.key === settings.cinematicIntensity)?.note}
          </p>

          <div className="mc-rule my-4" />

          {/* Accessibility & Camera */}
          <p className="mc-display mb-2 text-[0.6rem] tracking-[0.3em] text-[#a89268] uppercase font-semibold">Accessibility & Motion</p>
          <Toggle
            label="Reduced Motion"
            note="Softens rapid camera pans and zooms during combat"
            value={settings.reducedMotion}
            onChange={(value) => onChange({ ...settings, reducedMotion: value })}
          />
          <Toggle
            label="Reduced Flashing"
            note="Dims intense spell impacts and lightning flashes"
            value={settings.reducedFlashing}
            onChange={(value) => onChange({ ...settings, reducedFlashing: value })}
          />
          <Toggle
            label="Swing camera between turns"
            note="Orient camera toward the active player in hotseat mode"
            value={settings.rotateBoard}
            onChange={(value) => onChange({ ...settings, rotateBoard: value })}
          />
          <Toggle
            label="Floating Rank Crests"
            note="Displays floating heraldic faction badges above figures"
            value={settings.rankBadges}
            onChange={(value) => onChange({ ...settings, rankBadges: value })}
          />
          <Toggle
            label="Master Audio"
            note="Dark fantasy orchestral score, ambience, and combat sounds"
            value={!settings.muted}
            onChange={(value) => onChange({ ...settings, muted: !value })}
          />
        </div>
      </div>
    </div>
  );
}

function Toggle({
  label,
  note,
  value,
  onChange,
}: {
  label: string;
  note: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between gap-4 border-b border-[#8a652222] py-2.5 text-left last:border-b-0"
      onClick={() => onChange(!value)}
    >
      <span>
        <span className="mc-display block text-[0.76rem] text-[#efe0c0] font-semibold">{label}</span>
        <span className="text-xs italic text-[#9c8b6c]">{note}</span>
      </span>
      <span
        className="relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200"
        style={{
          background: value ? "linear-gradient(180deg,#d8b163,#8a6522)" : "rgba(20,18,15,0.8)",
          borderColor: value ? "rgba(246,223,165,0.8)" : "rgba(216,177,99,0.3)",
        }}
      >
        <span
          className="absolute top-0.5 h-4.5 w-4.5 rounded-full bg-[#1a1710] transition-all duration-200"
          style={{ left: value ? "1.55rem" : "0.15rem", width: "1.1rem", height: "1.1rem" }}
        />
      </span>
    </button>
  );
}
