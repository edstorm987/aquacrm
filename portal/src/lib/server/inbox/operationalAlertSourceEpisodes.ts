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
