"use client";

import { useState } from "react";

import type { Affiliate, ReferralCode } from "../lib/domain";

export interface CodesListProps {
  codes: ReferralCode[];
  affiliates: Affiliate[];
  apiBase: string;
}

export function CodesList({ codes, affiliates, apiBase }: CodesListProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const affiliateById = new Map(affiliates.map(a => [a.id, a]));
  return (
    <section className="affiliates-codes">
      <header className="affiliates-list-header">
        <div>
          <h1>Codes</h1>
          <p>{codes.length === 0 ? "No codes yet." : `${codes.length} code${codes.length === 1 ? "" : "s"}`}</p>
        </div>
      </header>

      <ul className="affiliates-codes-grid">
        {codes.map(c => {
          const aff = affiliateById.get(c.affiliateId);
          return (
            <li key={c.id}>
              <article className={`affiliates-code-card affiliates-code-${c.status}`}>
                <header>
                  <code>{c.code}</code>
                  <span className={`affiliates-pill affiliates-pill-${c.status}`}>{c.status}</span>
                </header>
                <p className="affiliates-meta">{aff?.displayName ?? "—"}</p>
                <p className="affiliates-meta">{c.redemptionCount} redemption{c.redemptionCount === 1 ? "" : "s"}</p>
                {c.commissionPercentOverride !== undefined && (
                  <p className="affiliates-meta">Override: {c.commissionPercentOverride}%</p>
                )}
              </article>
            </li>
          );
        })}
      </ul>

      <form
        className="affiliates-code-create"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          const fd = new FormData(e.currentTarget);
          const body = {
            affiliateId: String(fd.get("affiliateId") ?? ""),
            code: String(fd.get("code") ?? "").trim() || undefined,
            destinationPath: String(fd.get("destinationPath") ?? "").trim() || undefined,
            commissionPercentOverride: Number(fd.get("commissionPercentOverride") ?? 0) || undefined,
          };
          if (!body.affiliateId) {
            setError("affiliateId required");
            return;
          }
          setBusy(true);
          try {
            const r = await fetch(`${apiBase}/codes`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            });
            const data = await r.json();
            if (!r.ok || !data.ok) {
              setError(data?.error ?? `Failed (${r.status})`);
              return;
            }
            window.location.reload();
          } finally {
            setBusy(false);
          }
        }}
      >
        <h3>Create code</h3>
        <label>Affiliate
          <select name="affiliateId" required defaultValue="">
            <option value="" disabled>Select…</option>
            {affiliates.filter(a => a.status === "active" || a.status === "pending").map(a => (
              <option key={a.id} value={a.id}>{a.displayName}</option>
            ))}
          </select>
        </label>
        <label>Code (leave blank to auto-generate)<input name="code" placeholder="FELICIA10" /></label>
        <label>Destination path<input name="destinationPath" placeholder="/" /></label>
        <label>% override<input name="commissionPercentOverride" type="number" min="0" max="100" /></label>
        {error && <p className="affiliates-form-error">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? "Creating…" : "Create"}</button>
      </form>
    </section>
  );
}
