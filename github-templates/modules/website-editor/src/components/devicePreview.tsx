"use client";

// Chrome DevTools-style device preview toolbar for the page editor.
//
// Sits above the canvas. Operator picks a device (or Responsive +
// custom W×H), rotates portrait/landscape, zooms, and toggles the
// decorative phone/tablet bezel. Selection persists across sessions
// in localStorage so reopening the editor remembers the last device.
//
// The component is purely presentational; the parent passes `state`
// + `onChange` and renders the canvas using `effectiveViewport(...)`
// so the maths stays in one place.

import { useMemo } from "react";
import {
  CATEGORY_LABELS, DEVICE_PRESETS, effectiveViewport,
  getDevicePreset, type DeviceCategory, type DeviceSpec, type DeviceState,
} from "../lib/devicePresets";

interface Props {
  state: DeviceState;
  onChange: (next: DeviceState) => void;
}

const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5];

export default function DevicePreview({ state, onChange }: Props) {
  const spec = getDevicePreset(state.deviceId) ?? DEVICE_PRESETS[0]!;
  const viewport = effectiveViewport(spec, state);

  const groups = useMemo(() => {
    const acc: Record<DeviceCategory, DeviceSpec[]> = {
      responsive: [], phone: [], tablet: [], laptop: [], desktop: [],
    };
    for (const d of DEVICE_PRESETS) acc[d.category].push(d);
    return acc;
  }, []);

  function update(patch: Partial<DeviceState>) {
    onChange({ ...state, ...patch });
  }

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white/[0.02] border-b border-white/5 text-[11px] text-brand-cream/85">
      {/* Device dropdown — categorised */}
      <div className="relative">
        <select
          value={state.deviceId}
          onChange={e => update({ deviceId: e.target.value })}
          className="appearance-none bg-white/5 hover:bg-white/10 border border-white/10 rounded-md pl-2.5 pr-7 py-1 text-[11px] text-brand-cream cursor-pointer focus:outline-none focus:border-cyan-400/40"
          title="Pick a device preset"
        >
          {(Object.keys(groups) as DeviceCategory[]).map(category => (
            <optgroup key={category} label={CATEGORY_LABELS[category]}>
              {groups[category].map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}{d.id !== "responsive" ? `  ${d.width}×${d.height}` : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-brand-cream/40 text-[10px]">▾</span>
      </div>

      {/* W × H readout / custom inputs in Responsive mode */}
      {spec.id === "responsive" ? (
        <div className="flex items-center gap-1 text-brand-cream/60">
          <input
            type="number"
            value={viewport.width}
            min={240}
            max={4000}
            onChange={e => update({ customWidth: Number(e.target.value) || spec.width })}
            className="w-16 bg-white/5 border border-white/10 rounded-md px-1.5 py-0.5 text-[11px] text-brand-cream text-center focus:outline-none focus:border-cyan-400/40"
            aria-label="Custom width"
          />
          <span className="text-brand-cream/40">×</span>
          <input
            type="number"
            value={viewport.height}
            min={320}
            max={4000}
            onChange={e => update({ customHeight: Number(e.target.value) || spec.height })}
            className="w-16 bg-white/5 border border-white/10 rounded-md px-1.5 py-0.5 text-[11px] text-brand-cream text-center focus:outline-none focus:border-cyan-400/40"
            aria-label="Custom height"
          />
        </div>
      ) : (
        <span className="text-brand-cream/55 font-mono">{viewport.width} × {viewport.height}</span>
      )}

      {/* Rotate */}
      {spec.id !== "responsive" && (
        <button
          type="button"
          onClick={() => update({ rotated: !state.rotated })}
          className={`px-2 py-1 rounded-md transition-colors ${state.rotated ? "bg-cyan-400/15 text-cyan-200" : "bg-white/5 hover:bg-white/10 text-brand-cream/85"}`}
          title={state.rotated ? "Rotate to portrait" : "Rotate to landscape"}
        >
          ↻
        </button>
      )}

      <span className="w-px h-4 bg-white/10" />

      {/* Zoom */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            const idx = ZOOM_STEPS.indexOf(state.zoom);
            const next = idx > 0 ? ZOOM_STEPS[idx - 1] : ZOOM_STEPS[0];
            update({ zoom: next });
          }}
          className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 transition-colors"
          title="Zoom out"
        >
          −
        </button>
        <select
          value={String(state.zoom)}
          onChange={e => update({ zoom: Number(e.target.value) })}
          className="appearance-none bg-white/5 hover:bg-white/10 border border-white/10 rounded-md px-2 py-0.5 text-[11px] cursor-pointer focus:outline-none focus:border-cyan-400/40"
          title="Zoom level"
        >
          {ZOOM_STEPS.map(z => (
            <option key={z} value={z}>{Math.round(z * 100)}%</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            const idx = ZOOM_STEPS.indexOf(state.zoom);
            const next = idx < ZOOM_STEPS.length - 1 ? ZOOM_STEPS[idx + 1] : ZOOM_STEPS[ZOOM_STEPS.length - 1];
            update({ zoom: next });
          }}
          className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 transition-colors"
          title="Zoom in"
        >
          +
        </button>
      </div>

      {/* Decorative chrome toggle (only meaningful for phones / tablets) */}
      {(spec.category === "phone" || spec.category === "tablet") && spec.bezel && (
        <>
          <span className="w-px h-4 bg-white/10" />
          <button
            type="button"
            onClick={() => update({ showChrome: !state.showChrome })}
            className={`px-2 py-1 rounded-md transition-colors ${state.showChrome ? "bg-cyan-400/15 text-cyan-200" : "bg-white/5 hover:bg-white/10 text-brand-cream/85"}`}
            title="Show device frame (bezels)"
          >
            Frame
          </button>
        </>
      )}

      <span className="ml-auto text-brand-cream/40 text-[10px] hidden sm:inline">
        {spec.hint ? spec.hint : "Tip: ⌘1 / 2 / 3 for desktop / tablet / phone presets"}
      </span>
    </div>
  );
}
