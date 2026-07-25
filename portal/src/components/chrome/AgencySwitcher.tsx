"use client";
// AgencySwitcher — the agency-name TITLE button in the Topbar (Ed's
// directive 2026-05-07). Used to be a small chip in the right
// cluster + hidden when ≤1 agency; now it's the prominent left-side
// title and ALWAYS shows, with "+ Add agency" at the bottom of the
// dropdown so Ed can spin up new tenants from the UI.
//
// T1 R026 (chapter #133) shipped the original chip; this round
// promotes it to title + adds the agency-add flow.

import { useState } from "react";

export interface AgencyOption {
  id: string;
  name: string;
  swatch?: string;
  isActive?: boolean;
}

interface Props {
  agencies: AgencyOption[];
  activeAgencyId: string;
  /** Subtitle line under the agency name — e.g. "Agency workspace". */
  subtitle?: string;
}

export function AgencySwitcher({ agencies, activeAgencyId, subtitle }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  // Falls back gracefully when called with [] (parked T5/T6 cases).
  const list = agencies && agencies.length > 0 ? agencies : [];
  const active = list.find(a => a.id === activeAgencyId) ?? list[0];

  async function onPick(agencyId: string) {
    if (agencyId === activeAgencyId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/agency-switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agencyId }),
      });
      const data = (await res.json()) as { ok: boolean; redirect?: string; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Couldn't switch.");
        setBusy(false);
        return;
      }
      const target = data.redirect ?? "/portal";
      if (typeof window !== "undefined") window.location.href = target;
    } catch {
      setError("Network error. Try again.");
      setBusy(false);
    }
  }

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/agency-add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = (await res.json()) as { ok: boolean; redirect?: string; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Couldn't add agency.");
        setBusy(false);
        return;
      }
      const target = data.redirect ?? "/portal/agency";
      if (typeof window !== "undefined") window.location.href = target;
    } catch {
      setError("Network error. Try again.");
      setBusy(false);
    }
  }

  if (!active) return null;

  return (
    <details className="mm-tenant-switcher" data-testid="agency-switcher">
      <summary aria-label={`Active agency: ${active.name}. Click to switch or add another.`}>
        <span
          aria-hidden
          className="mm-tenant-swatch"
          style={{ background: active.swatch ?? "#e5e7eb" }}
        />
        <span className="mm-tenant-label">
          <span className="mm-tenant-name">{active.name}</span>
          {subtitle && <span className="mm-tenant-sub">{subtitle}</span>}
        </span>
        <span aria-hidden className="mm-tenant-caret">▾</span>
      </summary>
      <div role="menu" className="mm-tenant-pop">
        <div className="mm-tenant-pop-head">Switch agency</div>
        {list.map(a => (
          <button
            key={a.id}
            type="button"
            role="menuitem"
            onClick={() => onPick(a.id)}
            disabled={busy}
            data-agency-id={a.id}
            data-active={a.id === activeAgencyId ? "true" : undefined}
            className="mm-tenant-row"
          >
            <span
              aria-hidden
              className="mm-tenant-swatch"
              style={{ background: a.swatch ?? "#e5e7eb" }}
            />
            <span className="mm-tenant-row-name">{a.name}</span>
            {a.id === activeAgencyId && <span className="mm-tenant-tick" aria-label="Active">✓</span>}
          </button>
        ))}

        <div className="mm-tenant-divider" aria-hidden />

        {!adding ? (
          <button
            type="button"
            role="menuitem"
            onClick={() => { setAdding(true); setError(null); }}
            disabled={busy}
            className="mm-tenant-row mm-tenant-add-trigger"
          >
            <span aria-hidden className="mm-tenant-plus">＋</span>
            <span>Add new agency</span>
          </button>
        ) : (
          <form onSubmit={onAdd} className="mm-tenant-add-form">
            <label className="mm-tenant-add-label">
              <span>Agency name</span>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                autoFocus
                required
                disabled={busy}
                placeholder="AquaOasis · Therapists"
                className="mm-tenant-add-input"
              />
            </label>
            <div className="mm-tenant-add-actions">
              <button type="button" onClick={() => { setAdding(false); setNewName(""); setError(null); }} disabled={busy} className="mm-tenant-add-cancel">
                Cancel
              </button>
              <button type="submit" disabled={busy || !newName.trim()} className="mm-tenant-add-submit">
                {busy ? "Adding…" : "Create + switch"}
              </button>
            </div>
          </form>
        )}

        {error && <p role="alert" className="mm-tenant-error">{error}</p>}
      </div>
    </details>
  );
}
