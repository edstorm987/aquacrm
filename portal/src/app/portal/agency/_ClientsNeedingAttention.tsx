"use client";

import Link from "next/link";
import { ArrowRight, HeartPulse } from "lucide-react";

import type { ClientAttentionItem } from "@/lib/server/clients/clientAttention";

/**
 * Command Centre roll-up: which clients need attention, how bad, and the single
 * top reason — never a bare count. Each row links into the client's Fulfilment
 * workspace, where the full detail lives. Data comes from
 * `listClientsNeedingAttention` (the client-radar fleet).
 */
export function ClientsNeedingAttention({ items }: { items: ClientAttentionItem[] }) {
  const risk = items.filter(item => item.state === "risk").length;
  return (
    <section className="mm-surface-card overflow-hidden rounded-lg border border-black/10 p-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HeartPulse size={16} className="text-rose-600" />
          <h3 className="text-sm font-semibold text-black/82">Clients needing attention</h3>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${items.length ? (risk ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700") : "bg-emerald-50 text-emerald-700"}`}>
          {items.length ? `${items.length} to review${risk ? ` · ${risk} at risk` : ""}` : "All clear"}
        </span>
      </header>

      {items.length === 0 ? (
        <p className="mt-3 text-xs leading-5 text-black/45">
          No active client is currently in a risk or watch state. Health signals are holding.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5">
          {items.map(item => (
            <li key={item.clientId}>
              <Link
                href={item.href}
                title={item.headline}
                className="group flex items-center gap-3 rounded-md border border-black/10 px-3 py-2 hover:border-black/20 hover:bg-black/[0.02]"
              >
                <span
                  aria-hidden
                  className={`mt-0.5 size-2 shrink-0 rounded-full ${item.state === "risk" ? "bg-rose-500" : "bg-amber-500"}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-black/82">{item.clientName}</span>
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${item.state === "risk" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>
                      {item.state}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-black/50">{item.headline}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-sm font-semibold tabular-nums text-black/70">{item.score ?? "—"}<span className="text-[10px] font-normal text-black/35">/100</span></span>
                  <ArrowRight size={14} className="text-black/35 group-hover:text-black/60" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
