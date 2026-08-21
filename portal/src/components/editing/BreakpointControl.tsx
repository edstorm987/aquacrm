"use client";

import { Monitor, RotateCcw, Smartphone, Tablet } from "lucide-react";

import { DEVICE_PRESETS, type DeviceSpec } from "@built-ins/modules/website-editor/src/lib/devicePresets";

// ─── DEV EDITOR — breakpoints ────────────────────────────────────────────────
//
// "Any breakpoint we want": the editor previewed at exactly two widths, which
// is not how responsive work is done. The device library already existed
// (31 DevTools-style presets, rotation, bezels) and had never been mounted —
// this mounts it, and adds a free width box so an arbitrary breakpoint can be
// typed rather than chosen.

export interface Breakpoint {
  /** A preset id, or "custom" when a width was typed. */
  id: string;
  width: number;
  height: number;
  landscape: boolean;
}

export const DEFAULT_BREAKPOINT: Breakpoint = { id: "responsive", width: 1280, height: 800, landscape: false };

/** Width/height with rotation applied — what the canvas actually renders at. */
export function breakpointSize(breakpoint: Breakpoint): { width: number; height: number } {
  return breakpoint.landscape
    ? { width: breakpoint.height, height: breakpoint.width }
    : { width: breakpoint.width, height: breakpoint.height };
}

export function breakpointLabel(breakpoint: Breakpoint): string {
  const { width, height } = breakpointSize(breakpoint);
  if (breakpoint.id === "responsive") return `Responsive · ${width}px`;
  const preset = DEVICE_PRESETS.find(item => item.id === breakpoint.id);
  return `${preset?.name ?? "Custom"} · ${width} × ${height}`;
}

const CATEGORY_ORDER: DeviceSpec["category"][] = ["responsive", "phone", "tablet", "laptop", "desktop"];
const CATEGORY_LABELS: Record<DeviceSpec["category"], string> = {
  responsive: "Responsive",
  phone: "Phones",
  tablet: "Tablets",
  laptop: "Laptops",
  desktop: "Desktops",
};

/** Quick jumps — the three widths people actually check first. */
const QUICK: { id: string; label: string; icon: typeof Monitor }[] = [
  { id: "iphone-12", label: "Phone", icon: Smartphone },
  { id: "ipad-air", label: "Tablet", icon: Tablet },
  { id: "responsive", label: "Desktop", icon: Monitor },
];

export function BreakpointControl({
  value,
  onChange,
}: {
  value: Breakpoint;
  onChange: (next: Breakpoint) => void;
}) {
  const pick = (id: string) => {
    const preset = DEVICE_PRESETS.find(item => item.id === id);
    if (!preset) return;
    onChange({ id: preset.id, width: preset.width, height: preset.height, landscape: false });
  };

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <div className="inline-flex shrink-0 rounded-md border border-white/10 bg-black/25 p-1" aria-label="Quick breakpoints">
        {QUICK.map(item => {
          const Icon = item.icon;
          const active = value.id === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => pick(item.id)}
              aria-label={item.label}
              title={item.label}
              aria-pressed={active}
              className={`grid size-8 place-items-center rounded ${active ? "bg-white/15 text-white" : "text-white/50 hover:bg-white/10 hover:text-white/85"}`}
            >
              <Icon size={15} />
            </button>
          );
        })}
      </div>

      <select
        aria-label="Breakpoint"
        value={DEVICE_PRESETS.some(item => item.id === value.id) ? value.id : "custom"}
        onChange={event => pick(event.target.value)}
        className="h-10 min-w-0 max-w-40 rounded-md border border-white/10 bg-white/[0.06] px-2 text-[11px] font-medium text-white outline-none"
      >
        {value.id === "custom" ? <option value="custom" className="bg-[#1a1c1a]">Custom</option> : null}
        {CATEGORY_ORDER.map(category => {
          const items = DEVICE_PRESETS.filter(item => item.category === category);
          if (!items.length) return null;
          return (
            <optgroup key={category} label={CATEGORY_LABELS[category]} className="bg-[#1a1c1a]">
              {items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </optgroup>
          );
        })}
      </select>

      {/* Any breakpoint, typed. */}
      <label className="inline-flex h-10 shrink-0 items-center gap-1 rounded-md border border-white/10 bg-white/[0.06] px-2 text-[11px] text-white/70">
        <span className="sr-only">Custom width in pixels</span>
        <input
          type="number"
          min={240}
          max={3840}
          value={breakpointSize(value).width}
          onChange={event => {
            const width = Number(event.target.value);
            if (!Number.isFinite(width) || width < 240) return;
            onChange({ id: "custom", width, height: value.height, landscape: false });
          }}
          className="w-14 bg-transparent text-right outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        px
      </label>

      <button
        type="button"
        onClick={() => onChange({ ...value, landscape: !value.landscape })}
        aria-pressed={value.landscape}
        title="Rotate"
        aria-label="Rotate"
        className={`grid size-10 shrink-0 place-items-center rounded-md border border-white/10 ${value.landscape ? "bg-white/15 text-white" : "text-white/55 hover:bg-white/5 hover:text-white"}`}
      >
        <RotateCcw size={15} />
      </button>
    </div>
  );
}
