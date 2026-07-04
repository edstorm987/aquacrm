"use client";

import { useState } from "react";

import type { Client, ClientStage, PhaseDefinition } from "../lib/tenancy";
import { NewClientModal } from "./NewClientModal";

export interface ClientCardData {
  client: Client;
  phaseLabel: string;
  internalDone: number;
  internalTotal: number;
  clientDone: number;
  clientTotal: number;
  lastActivityAt?: number;
}

export interface ClientListProps {
  cards: ClientCardData[];
  apiBase: string;
  agencyClientHrefBase: string;   // e.g. "/portal/agency/fulfillment"
  phasePresets: { stage: ClientStage; label: string; pluginPreset: readonly string[] }[];
}

export function ClientList(props: ClientListProps) {
  const { cards, apiBase, agencyClientHrefBase, phasePresets } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = cards.filter(c => {
    if (!query) return true;
    const haystack = `${c.client.name} ${c.client.slug} ${c.phaseLabel}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  return (
    <section className="fulfillment-client-list">
      <header className="fulfillment-list-header">
        <div>
          <h1>Clients</h1>
          <p>
            {cards.length === 0
              ? "No clients yet."
              : `${cards.length} client${cards.length === 1 ? "" : "s"} in your agency.`}
          </p>
        </div>
        <div className="fulfillment-list-actions">
          <input
            type="search"
            placeholder="Search clients…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search clients"
          />
          <button type="button" onClick={() => setOpen(true)}>+ New client</button>
        </div>
      </header>

      {filtered.length === 0 ? (
        <div className="fulfillment-empty-card">
          <p>{query ? "No clients match your search." : "Create your first client to begin."}</p>
        </div>
      ) : (
        <ul className="fulfillment-client-grid">
          {filtered.map(card => {
            const totalTasks = card.internalTotal + card.clientTotal;
            const doneTasks = card.internalDone + card.clientDone;
            const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
            const href = `${agencyClientHrefBase}/${card.client.id}`;
            const brand = card.client.brand.primaryColor;
            return (
              <li key={card.client.id}>
                <a className="fulfillment-client-card" href={href} style={{ ['--client-brand']: brand } as React.CSSProperties}>
                  <header>
                    {card.client.brand.logoUrl ? (
                      // Img tag — Next.js Image isn't available in the standalone manifest.
                      // Foundation can swap to <Image /> if it wraps the page.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={card.client.brand.logoUrl} alt="" className="fulfillment-client-logo" />
                    ) : (
                      <div className="fulfillment-client-logo fulfillment-client-logo-placeholder">
                        {card.client.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <h2>{card.client.name}</h2>
                      <p className="fulfillment-client-stage">{card.phaseLabel}</p>
                    </div>
                  </header>
                  <div className="fulfillment-client-progress">
                    <span>{doneTasks}/{totalTasks} tasks</span>
                    <div className="fulfillment-progress-bar" aria-hidden>
                      <div className="fulfillment-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  {card.lastActivityAt && (
                    <p className="fulfillment-client-last-activity">
                      Last activity {new Date(card.lastActivityAt).toLocaleDateString()}
                    </p>
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      )}

      <NewClientModal
        open={open}
        apiBase={apiBase}
        onClose={() => setOpen(false)}
        onCreated={() => {
          if (typeof window !== "undefined") window.location.reload();
        }}
        phasePresets={phasePresets}
      />
    </section>
  );
}
