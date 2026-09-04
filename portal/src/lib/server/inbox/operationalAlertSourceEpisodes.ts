import "server-only";

import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";
import { getState, mutate } from "@/server/storage";

function episodeKey(agencyId: string, sourceId: string): string {
  return `${agencyId}|${encodeURIComponent(sourceId)}`;
}

function transactionKey(agencyId: string, sourceId: string): string {
  return `operational-alert-source:${JSON.stringify([agencyId, sourceId])}`;
}

/**
 * Reconcile one observed source read with its durable outage episode.
 *
 * Every observation enters the coordinated lane. Keeping the last healthy
 * cursor is what lets a delayed older failure lose to a newer recovery.
 */
export async function observeOperationalAlertSourceAvailability(input: {
  agencyId: string;
  sourceId: string;
  available: boolean;
  observedAt: number;
}): Promise<{ active: boolean; startedAt?: number }> {
  const key = episodeKey(input.agencyId, input.sourceId);

  // ── Read-only fast path ──────────────────────────────────────────────────
  // This runs on EVERY agency/clients render. The coordinated write transaction
  // below is expensive on serverless — it forces a fresh full-state hydrate and a
  // product-workspace lease round-trip even when it writes nothing — and that
  // per-render cost is a primary driver of the render slowness. So decide
  // read-only first whether a durable change is even possible, and skip the
  // transaction entirely for the steady-state healthy observation (which
  // re-stamped observedAt but persisted nothing any consumer reads). Only cases
  // that can actually change the episode enter the transaction, which re-reads
  // under the lock and stays authoritative — so this narrows work, never widens it.
  const snapshot = getState().operationalAlertSourceEpisodes[key];
  const snapshotObservedAt = snapshot?.observedAt ?? snapshot?.startedAt;
  if (
    typeof snapshotObservedAt === "number"
    && Number.isFinite(snapshotObservedAt)
    && input.observedAt < snapshotObservedAt
  ) {
    // An older observation than the one already recorded — read-only either way.
    return snapshot?.available === false || snapshot?.available === undefined
      ? { active: true, startedAt: snapshot.startedAt }
      : { active: false };
  }
  if (input.available && snapshot?.available === true) {
    // Already recorded healthy and not an older observation → nothing to persist.
    return { active: false };
  }

  return withPortalStateTransaction(transactionKey(input.agencyId, input.sourceId), () => {
    const existing = getState().operationalAlertSourceEpisodes[key];
    const existingObservedAt = existing?.observedAt ?? existing?.startedAt;
    if (
      typeof existingObservedAt === "number"
      && Number.isFinite(existingObservedAt)
      && input.observedAt < existingObservedAt
    ) {
      return existing?.available === false || existing?.available === undefined
        ? { active: true, startedAt: existing.startedAt }
        : { active: false };
    }
    if (input.available) {
      mutate(state => {
        state.operationalAlertSourceEpisodes[key] = {
          agencyId: input.agencyId,
          sourceId: input.sourceId,
          available: true,
          observedAt: input.observedAt,
        };
      });
      return { active: false };
    }

    if (
      existing
      && existing.available !== true
      && existing.agencyId === input.agencyId
      && existing.sourceId === input.sourceId
      && typeof existing.startedAt === "number"
      && Number.isFinite(existing.startedAt)
    ) {
      if (input.observedAt > (existingObservedAt ?? Number.NEGATIVE_INFINITY)) {
        mutate(state => {
          state.operationalAlertSourceEpisodes[key] = {
            ...existing,
            available: false,
            observedAt: input.observedAt,
          };
        });
      }
      return { active: true, startedAt: existing.startedAt };
    }

    mutate(state => {
      state.operationalAlertSourceEpisodes[key] = {
        agencyId: input.agencyId,
        sourceId: input.sourceId,
        available: false,
        observedAt: input.observedAt,
        startedAt: input.observedAt,
      };
    });
    return { active: true, startedAt: input.observedAt };
  });
}
