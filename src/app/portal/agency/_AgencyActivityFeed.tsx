"use client";

// "Today across the agency" feed (T1 R18). Pulls T2's activity-inbox
// list, renders 15 most recent events. Plugin-missing path is graceful
// per honesty contract — no fabrication.

import { useEffect, useState } from "react";
import { describeActivityChip } from "@/lib/chrome/activityCategoryStyle";

interface InboxEntry {
  id: string;
  ts: number;
  category: string;
  action?: string;
  message: string;
  actorEmail?: string;
  clientId?: string;
}

function formatRelative(ts: number): string {
  const delta = Date.now() - ts;
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h ago`;
  if (delta < 7 * 86_400_000) return `${Math.round(delta / 86_400_000)}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function AgencyActivityFeed() {
  const [items, setItems] = useState<InboxEntry[] | null>(null);
  const [pluginMissing, setPluginMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/portal/activity-inbox/list?limit=15", { method: "GET" })
      .then(r => {
        if (!r.ok) {
          setPluginMissing(true);
          return null;
        }
        return r.json() as Promise<{ ok: boolean; entries?: InboxEntry[] }>;
      })
      .then(data => {
        if (cancelled) return;
        if (data) setItems(data.entries ?? []);
      })
      .catch(() => {
        if (!cancelled) setPluginMissing(true);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <section
      data-testid="agency-activity-feed"
      aria-labelledby="agency-feed-title"
      className="rounded-xl border border-black/10 bg-white p-4"
    >
      <header className="flex items-baseline justify-between gap-2">
        <h2 id="agency-feed-title" className="text-sm font-medium text-black/85">
          Today across the agency
        </h2>
        <a
          href="/portal/agency/activity-inbox"
          className="text-xs text-black/55 hover:underline"
        >
          Open inbox →
        </a>
      </header>
      <div className="mt-3">
        {pluginMissing ? (
          <p className="text-sm italic text-black/55">
            Connect activity-inbox to see events. Chapter #68 honesty: no fabricated feed.
          </p>
        ) : items === null ? (
          <p className="text-sm text-black/55">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm italic text-black/55">No activity yet today.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {items.map(e => {
              const chip = describeActivityChip(e as Parameters<typeof describeActivityChip>[0]);
              const warn = chip.severity === "warn";
              const err = chip.severity === "error";
              return (
                <li
                  key={e.id}
                  data-severity={chip.severity}
                  className={
                    "flex items-baseline justify-between gap-3 border-b pb-1.5 last:border-0 " +
                    (err
                      ? "border-l-2 border-l-red-600 border-b-red-200 pl-2"
                      : warn
                        ? "border-l-2 border-l-amber-500 border-b-amber-100 pl-2"
                        : "border-black/5")
                  }
                >
                  <span className="min-w-0 flex-1 text-sm text-black/80">
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] uppercase tracking-wide"
                      style={{
                        background: chip.category.color + "1a",
                        color: chip.category.color,
                        border: `1px solid ${chip.category.color}55`,
                      }}
                      aria-label={`Category: ${chip.category.label}`}
                    >
                      <span aria-hidden>{chip.category.icon}</span>
                      {chip.category.label}
                    </span>{" "}
                    {(warn || err) && (
                      <span aria-label="High-severity event" className="mr-1">🔔</span>
                    )}
                    {e.message}
                  </span>
                  <span className="shrink-0 text-[11px] text-black/45">
                    {formatRelative(e.ts)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
