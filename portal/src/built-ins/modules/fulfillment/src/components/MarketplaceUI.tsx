"use client";

import { useMemo, useState } from "react";

import type { MarketplaceCard, MarketplaceListResult } from "../server";
import { PluginCard } from "./PluginCard";

export interface MarketplaceUIProps {
  apiBase: string;
  clientId: string;
  clientName: string;
  initial: MarketplaceListResult;
}

export function MarketplaceUI(props: MarketplaceUIProps) {
  const { apiBase, clientId, clientName, initial } = props;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("");

  const filtered = useMemo<MarketplaceCard[]>(() => {
    const q = query.toLowerCase();
    return initial.cards.filter(c => {
      if (category && c.category !== category) return false;
      if (!q) return true;
      const haystack = `${c.id} ${c.name} ${c.tagline} ${c.description}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [initial.cards, query, category]);

  return (
    <section className="fulfillment-marketplace">
      <header className="fulfillment-list-header">
        <div>
          <h1>Plugin marketplace</h1>
          <p>
            Installing for <strong>{clientName}</strong>. Each install is scoped to this client only.
          </p>
        </div>
        <div className="fulfillment-list-actions">
          <input
            type="search"
            placeholder="Search plugins…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search plugins"
          />
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
            <option value="">All categories</option>
            {initial.facets.categories.map(c => (
              <option key={c.id} value={c.id}>{c.id} ({c.count})</option>
            ))}
          </select>
        </div>
      </header>

      {filtered.length === 0 ? (
        <p className="fulfillment-empty">No plugins match your filters.</p>
      ) : (
        <div className="fulfillment-plugin-grid">
          {filtered.map(card => (
            <PluginCard key={card.id} card={card} apiBase={apiBase} clientId={clientId} />
          ))}
        </div>
      )}
    </section>
  );
}
