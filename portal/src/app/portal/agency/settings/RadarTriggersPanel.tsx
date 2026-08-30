"use client";

// Radar runtime triggers, from Settings.
//
// Ed, 2026-08-29: *"Radar needs a settings for runtime triggers, all of this
// stuff."*
//
// ── Loaded on selection, never on page load ───────────────────────────────
//
// `buildBusinessIssueRadar` walks the whole business — it is the single most
// expensive read in the app, and `/api/portal/advisor/radar` invalidates its
// cache before rebuilding. Loading that with the Settings page would put a
// multi-second sweep in front of somebody who came to change their invoice
// prefix.
//
// So it fetches when this tab is opened and not before. That is the same rule
// the roadmap's speed work applied to the Command Centre — *"stop inactive
// stations from executing before selection"* — and this is the same shape of
// mistake it was fixing.
//
// The panel itself is the one the Command Centre already uses. Many doors, one
// editor.

import { useEffect, useState } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";

import { RadarPolicyPanel } from "@/app/portal/agency/_RadarPolicyPanel";
import type { BusinessIssueRadar } from "@/engines/data/radar/businessRadar";

export function RadarTriggersPanel() {
  const [radar, setRadar] = useState<BusinessIssueRadar | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    fetch("/api/portal/advisor/radar", { cache: "no-store" })
      .then(response => response.json())
      .then(result => {
        if (!live) return;
        if (result?.ok && result.radar) setRadar(result.radar as BusinessIssueRadar);
        else setError("Radar could not be read.");
      })
      .catch(() => { if (live) setError("Radar could not be read."); });
    return () => { live = false; };
  }, []);

  if (error) {
    return (
      <p className="inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <TriangleAlert size={13} aria-hidden="true" /> {error}
      </p>
    );
  }

  if (!radar) {
    return (
      <p className="inline-flex items-center gap-2 text-xs text-black/45">
        <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
        Reading the business — this one is a full sweep, so it takes a moment.
      </p>
    );
  }

  return (
    <RadarPolicyPanel
      radar={radar}
      onSaved={next => setRadar(next)}
      // In the Command Centre this panel is a modal and Close dismisses it.
      // Here it IS the page, so there is nothing to close — the no-op is
      // deliberate rather than an oversight.
      onClose={() => {}}
    />
  );
}
