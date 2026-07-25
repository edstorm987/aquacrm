"use client";

// SaveTargetToggle — topbar widget showing the active save target +
// letting the operator switch between "shared portal" and "client
// repo" modes. Round-6.
//
// Visibility rules:
//   - Hidden entirely when PortalExportPort is unavailable (T2 R11
//     not installed for the agency).
//   - Visible but read-only when the active client's phase isn't
//     "live" (the toggle still shows the default — shared portal —
//     so operators see what's happening).
//   - Active toggle for Live clients with materialized repos.
//
// The widget is a small two-pill control with a tooltip explaining
// what each mode does. The active mode persists per (clientId,
// browser) via lib/saveTarget.ts.

import { useEffect, useState } from "react";
import {
  type SaveTarget,
  setSaveTarget,
  getSaveTarget,
  defaultSaveTargetForClient,
  onSaveTargetChange,
} from "../../lib/saveTarget";

export interface SaveTargetToggleProps {
  clientId: string;
  phase: string | null | undefined;
  clientRepoExists: boolean;
  portalExportAvailable: boolean;
  onChange?: (target: SaveTarget) => void;
}

export default function SaveTargetToggle({
  clientId,
  phase,
  clientRepoExists,
  portalExportAvailable,
  onChange,
}: SaveTargetToggleProps) {
  const defaultTarget: SaveTarget = defaultSaveTargetForClient({
    clientId,
    phase: phase ?? null,
    clientRepoExists,
    portalExportAvailable,
  });

  const [active, setActive] = useState<SaveTarget>(() =>
    portalExportAvailable ? getSaveTarget(clientId) : "shared-portal",
  );

  useEffect(() => {
    if (!portalExportAvailable) { setActive("shared-portal"); return; }
    setActive(getSaveTarget(clientId));
    return onSaveTargetChange(e => {
      if (e.clientId === clientId) setActive(e.target);
    });
  }, [clientId, portalExportAvailable]);

  // Hide entirely when the export plugin isn't installed.
  if (!portalExportAvailable) return null;

  // Phase isn't Live → show a read-only badge so the operator knows
  // why client-repo mode isn't available.
  if (phase !== "live" || !clientRepoExists) {
    return (
      <div
        title={
          phase !== "live"
            ? "Client repo mode unlocks at Live phase."
            : "Run portal-export → Materialize first to unlock client repo mode."
        }
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          borderRadius: 6,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          color: "rgba(255,255,255,0.55)",
          fontSize: 11,
        }}
      >
        <span aria-hidden>📦</span>
        <span>Saving to shared portal</span>
      </div>
    );
  }

  function pick(target: SaveTarget) {
    setSaveTarget(clientId, target);
    setActive(target);
    onChange?.(target);
  }

  const baseBtn: React.CSSProperties = {
    padding: "4px 10px",
    borderRadius: 6,
    border: "none",
    fontSize: 11,
    cursor: "pointer",
    background: "transparent",
    color: "rgba(255,255,255,0.65)",
    fontFamily: "inherit",
  };

  return (
    <div
      role="group"
      aria-label="Save target"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0,
        padding: 2,
        borderRadius: 8,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <button
        type="button"
        onClick={() => pick("shared-portal")}
        title="Save to shared portal storage. Default for pre-Live work."
        style={{
          ...baseBtn,
          background: active === "shared-portal" ? "rgba(99,123,255,0.2)" : "transparent",
          color: active === "shared-portal" ? "#bcc6ff" : "rgba(255,255,255,0.65)",
        }}
      >
        📦 Shared portal
      </button>
      <button
        type="button"
        onClick={() => pick("client-repo")}
        title="Save to clients/<slug>/ — the per-client repo. Default for Live clients."
        style={{
          ...baseBtn,
          background: active === "client-repo" ? "rgba(255,107,53,0.2)" : "transparent",
          color: active === "client-repo" ? "#ffd6c2" : "rgba(255,255,255,0.65)",
        }}
      >
        📁 Client repo
        {active !== defaultTarget && (
          <span
            title="Manual override — phase default differs"
            style={{
              marginLeft: 6,
              fontSize: 9,
              padding: "1px 4px",
              borderRadius: 3,
              background: "rgba(255,255,255,0.08)",
            }}
          >
            override
          </span>
        )}
      </button>
    </div>
  );
}
