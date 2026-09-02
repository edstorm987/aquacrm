"use client";

import { useState } from "react";

import type { MarketplaceCard } from "../server";
import {
  isFulfillmentPluginMutation,
  isFulfillmentPluginUninstall,
} from "../lib/mutationPayloads";
import { checkedJsonMutation, mutationErrorMessage } from "@/lib/client/checkedMutation";

export interface PluginCardProps {
  card: MarketplaceCard;
  apiBase: string;
  clientId: string;
  onChanged?: () => void;
}

export function PluginCard(props: PluginCardProps) {
  const { card, apiBase, clientId, onChanged } = props;
  const [busy, setBusy] = useState<"install" | "enable" | "disable" | "uninstall" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(action: "install" | "enable" | "disable" | "uninstall"): Promise<void> {
    const fallback = action === "install"
      ? "Could not install this plugin."
      : action === "uninstall"
        ? "Could not uninstall this plugin."
        : action === "enable"
          ? "Could not enable this plugin."
          : "Could not disable this plugin.";
    setBusy(action);
    setError(null);
    try {
      const path =
        action === "install" ? "marketplace/install"
          : action === "uninstall" ? "marketplace/uninstall"
            : "marketplace/enable";
      await checkedJsonMutation<unknown>(`${apiBase}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          pluginId: card.id,
          ...(action === "enable" || action === "disable"
            ? { enabled: action === "enable" }
            : {}),
        }),
      }, {
        fallback,
        validate: payload => action === "uninstall"
          ? isFulfillmentPluginUninstall(payload, { clientId, pluginId: card.id })
          : isFulfillmentPluginMutation(payload, {
            clientId,
            pluginId: card.id,
            enabled: action !== "disable",
          }),
      });
      onChanged?.();
      if (typeof window !== "undefined") window.location.reload();
    } catch (reason) {
      setError(mutationErrorMessage(reason, fallback));
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="fulfillment-plugin-card" data-installed={card.installed} data-enabled={card.enabled}>
      <header>
        <h3>{card.name}</h3>
        <span className={`fulfillment-status fulfillment-status-${card.status}`}>{card.status}</span>
      </header>
      <p className="fulfillment-tagline">{card.tagline}</p>
      <p className="fulfillment-category">{card.category}</p>
      {card.requires && card.requires.length > 0 && (
        <p className="fulfillment-requires">Requires: {card.requires.join(", ")}</p>
      )}

      {error && <p className="fulfillment-error" role="alert">{error}</p>}

      <div className="fulfillment-plugin-actions">
        {!card.installed ? (
          <button type="button" onClick={() => call("install")} disabled={busy !== null}>
            {busy === "install" ? "Installing…" : "Install"}
          </button>
        ) : (
          <>
            {card.enabled ? (
              <button type="button" onClick={() => call("disable")} disabled={busy !== null}>
                {busy === "disable" ? "Disabling…" : "Disable"}
              </button>
            ) : (
              <button type="button" onClick={() => call("enable")} disabled={busy !== null}>
                {busy === "enable" ? "Enabling…" : "Enable"}
              </button>
            )}
            <button type="button" onClick={() => call("uninstall")} disabled={busy !== null}>
              {busy === "uninstall" ? "Uninstalling…" : "Uninstall"}
            </button>
          </>
        )}
      </div>
    </article>
  );
}
