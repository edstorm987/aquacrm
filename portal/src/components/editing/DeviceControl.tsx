"use client";

import { Monitor, RotateCcw, Scan, Smartphone, Tablet } from "lucide-react";

import {
  CATEGORY_LABELS,
  DEFAULT_DEVICE_STATE,
  DEVICE_PRESETS,
  effectiveViewport,
  getDevicePreset,
  loadDeviceState,
  saveDeviceState,
  type DeviceCategory,
  type DeviceState,
} from "@built-ins/modules/website-editor/src/lib/devicePresets";

// ─── DEV EDITOR — real device sizing ─────────────────────────────────────────
//
// Ed: "custom dimensions preset for phones tablets laptops etc and it will
// make the browser to exactly that. it lives inside a box but the draggable
// thing is the box the browser sits in."
//
// This replaces `BreakpointControl`, which mounted the preset LIST but kept
// only the width of a choice honest — and even that was then squashed by the
// pane's `maxWidth: "100%"`, so "iPhone 14 Pro" meant "as much of 393px as
// the pane allows". The real device system — 26 presets with width AND
// height, rotation, zoom, custom dimensions, persistence — has lived in the
// website-editor module's `devicePresets.ts` all along; this control is the
// editor-skinned toolbar over it.
//
// Two deliberate choices:
//   • The MATHS is imported, never forked. `effectiveViewport` is the one
//     place rotation, custom sizes and presets combine; `DevicePreview`
//     (the module's own toolbar) reads the same functions. This file holds
//     chrome only.
//   • The module's `DevicePreview` toolbar is NOT mounted here, because it
//     wears the module's skin (brand-cream/cyan, a full-width strip above
//     that module's canvas) and the editor's header slot needs the editor's
//     vocabulary — `border-white/10`, `h-10` controls, compact. Lifting the
//     chrome and importing the maths is the split that avoids both a fork
//     and a wardrobe clash.
//
// The editor reaches the device system THROUGH this module (the re-exports
// below), the same single-door pattern `BreakpointControl` used — so
// `DevEditor.tsx` itself keeps zero `built-ins` imports.

export {
  DEFAULT_DEVICE_STATE,
  DEVICE_PRESETS,
  effectiveViewport,
  getDevicePreset,
  loadDeviceState,
  saveDeviceState,
  type DeviceState,
};

/** The bounds a device box may be dragged or typed to, in CSS pixels. */
export const DEVICE_MIN_WIDTH = 240;
export const DEVICE_MIN_HEIGHT = 320;
export const DEVICE_MAX_SIZE = 4000;

/** ONE clamp for every way a custom size is set — typed, dragged, or nudged by key. */
export function clampDeviceSize(width: number, height: number): { width: number; height: number } {
  return {
    width: Math.min(DEVICE_MAX_SIZE, Math.max(DEVICE_MIN_WIDTH, Math.round(width))),
    height: Math.min(DEVICE_MAX_SIZE, Math.max(DEVICE_MIN_HEIGHT, Math.round(height))),
  };
}

/**
 * The size label, in TRUE device CSS pixels — never the on-screen size.
 *
 * Zoom scales what you see, not what the page lays out at, so it is stated
 * separately rather than multiplied in. "iPhone 14 Pro · 393 × 852 · 50%"
 * means the page really is 393 CSS pixels wide.
 */
export function deviceLabel(state: DeviceState): string {
  const spec = getDevicePreset(state.deviceId) ?? DEVICE_PRESETS[0]!;
  const { width, height } = effectiveViewport(spec, state);
  const name = spec.category === "responsive" ? "Responsive" : spec.name;
  const zoom = state.zoom === 1 ? "" : ` · ${Math.round(state.zoom * 100)}%`;
  return `${name} · ${width} × ${height}${zoom}`;
}

const CATEGORY_ORDER: DeviceCategory[] = ["responsive", "phone", "tablet", "laptop", "desktop"];

/** Quick jumps — Responsive (the draggable box) plus the three sizes people check first. */
const QUICK: { id: string; label: string; icon: typeof Monitor }[] = [
  { id: "responsive", label: "Responsive — drag the box to any size", icon: Scan },
  { id: "iphone-12", label: "Phone", icon: Smartphone },
  { id: "ipad-air", label: "Tablet", icon: Tablet },
  { id: "desktop-1080", label: "Desktop", icon: Monitor },
];

/** Same steps as the module's DevicePreview — one zoom ladder everywhere. */
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5];

export function DeviceControl({
  value,
  onChange,
}: {
  value: DeviceState;
  onChange: (next: DeviceState) => void;
}) {
  const spec = getDevicePreset(value.deviceId) ?? DEVICE_PRESETS[0]!;
  const viewport = effectiveViewport(spec, value);
  const responsive = spec.category === "responsive";

  const update = (patch: Partial<DeviceState>) => onChange({ ...value, ...patch });
  const pick = (id: string) => {
    if (!getDevicePreset(id)) return;
    // A preset always arrives portrait; zoom is the operator's own knob and
    // survives the switch (a 4K preset at 50% should not snap to 400%-of-pane).
    update({ deviceId: id, rotated: false });
  };
  const setCustom = (width: number, height: number) => {
    const size = clampDeviceSize(width, height);
    update({ customWidth: size.width, customHeight: size.height });
  };

  return (
    <div className="flex max-w-full min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
      <div className="inline-flex shrink-0 rounded-md border border-white/10 bg-black/25 p-1" aria-label="Quick devices">
        {QUICK.map(item => {
          const Icon = item.icon;
          const active = value.deviceId === item.id;
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
        aria-label="Device preset"
        value={value.deviceId}
        onChange={event => pick(event.target.value)}
        className="h-10 min-w-0 max-w-44 rounded-md border border-white/10 bg-white/[0.06] px-2 text-[11px] font-medium text-white outline-none"
      >
        {CATEGORY_ORDER.map(category => {
          const items = DEVICE_PRESETS.filter(item => item.category === category);
          if (!items.length) return null;
          return (
            <optgroup key={category} label={CATEGORY_LABELS[category]} className="bg-[#1a1c1a]">
              {items.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}{item.category === "responsive" ? "" : ` — ${item.width}×${item.height}`}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>

      {responsive ? (
        // Custom W × H — the same numbers the drag handles write, typed.
        <label className="inline-flex h-10 shrink-0 items-center gap-1 rounded-md border border-white/10 bg-white/[0.06] px-2 font-mono text-[11px] text-white/70">
          <span className="sr-only">Custom width in pixels</span>
          <input
            type="number"
            min={DEVICE_MIN_WIDTH}
            max={DEVICE_MAX_SIZE}
            value={viewport.width}
            onChange={event => setCustom(Number(event.target.value) || spec.width, viewport.height)}
            className="w-12 bg-transparent text-right outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-white/35">×</span>
          <span className="sr-only">Custom height in pixels</span>
          <input
            type="number"
            min={DEVICE_MIN_HEIGHT}
            max={DEVICE_MAX_SIZE}
            value={viewport.height}
            onChange={event => setCustom(viewport.width, Number(event.target.value) || spec.height)}
            className="w-12 bg-transparent text-right outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
        </label>
      ) : (
        <button
          type="button"
          onClick={() => update({ rotated: !value.rotated })}
          aria-pressed={value.rotated}
          title={value.rotated ? "Rotate to portrait" : "Rotate to landscape"}
          aria-label="Rotate"
          className={`grid size-10 shrink-0 place-items-center rounded-md border border-white/10 ${value.rotated ? "bg-white/15 text-white" : "text-white/55 hover:bg-white/5 hover:text-white"}`}
        >
          <RotateCcw size={15} />
        </button>
      )}

      <select
        aria-label="Zoom"
        title="Zoom — scales the view, never the page's real size"
        value={String(value.zoom)}
        onChange={event => update({ zoom: Number(event.target.value) })}
        className="h-10 shrink-0 rounded-md border border-white/10 bg-white/[0.06] px-1.5 text-[11px] font-medium text-white outline-none"
      >
        {ZOOM_STEPS.includes(value.zoom) ? null : (
          <option value={String(value.zoom)} className="bg-[#1a1c1a]">{Math.round(value.zoom * 100)}%</option>
        )}
        {ZOOM_STEPS.map(step => (
          <option key={step} value={String(step)} className="bg-[#1a1c1a]">{Math.round(step * 100)}%</option>
        ))}
      </select>
    </div>
  );
}
