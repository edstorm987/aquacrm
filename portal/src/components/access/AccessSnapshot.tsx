"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  elementAccessLevel,
  sameScope,
  type AccessEnvironment,
  type AccessScope,
  type ElementAccessLevel,
} from "./accessModel";

export interface EffectiveAccessResolution {
  userId: string;
  agencyId: string;
  scope: AccessScope;
  environment: AccessEnvironment;
  capabilities: string[];
  grantIds: string[];
  ownerBaseline: boolean;
}

interface AccessSnapshotValue {
  scope: AccessScope;
  environment: AccessEnvironment;
  capabilities: readonly string[];
  grantIds: readonly string[];
  ownerBaseline: boolean;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
}

const AccessSnapshotContext = createContext<AccessSnapshotValue | null>(null);

export function AccessSnapshotProvider({
  scope,
  environment = "live",
  initialResolution,
  children,
}: {
  scope: AccessScope;
  environment?: AccessEnvironment;
  initialResolution?: EffectiveAccessResolution;
  children: ReactNode;
}) {
  const initial = initialResolution && sameScope(initialResolution.scope, scope) && initialResolution.environment === environment
    ? initialResolution
    : undefined;
  const [resolution, setResolution] = useState<EffectiveAccessResolution | undefined>(initial);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ kind: scope.kind, id: scope.id, environment });
      if (scope.clientId) query.set("clientId", scope.clientId);
      if (scope.projectId) query.set("projectId", scope.projectId);
      const response = await fetch(`/api/portal/access/effective?${query.toString()}`, { cache: "no-store", signal });
      const result = await response.json().catch(() => null) as { ok?: boolean; resolution?: EffectiveAccessResolution; error?: string } | null;
      if (!response.ok || !result?.ok || !result.resolution) throw new Error(result?.error || "Effective access could not be loaded.");
      if (!signal?.aborted) setResolution(result.resolution);
    } catch (cause) {
      if (!signal?.aborted) {
        setResolution(undefined);
        setError(cause instanceof Error ? cause.message : "Effective access could not be loaded.");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [environment, scope.clientId, scope.id, scope.kind, scope.projectId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const value = useMemo<AccessSnapshotValue>(() => ({
    scope,
    environment,
    capabilities: resolution?.capabilities ?? [],
    grantIds: resolution?.grantIds ?? [],
    ownerBaseline: resolution?.ownerBaseline ?? false,
    loading,
    error,
    refresh: () => load(),
  }), [environment, error, load, loading, resolution, scope]);

  return <AccessSnapshotContext.Provider value={value}>{children}</AccessSnapshotContext.Provider>;
}

export function useAccessSnapshot(): AccessSnapshotValue {
  const value = useContext(AccessSnapshotContext);
  if (!value) throw new Error("useAccessSnapshot must be used within AccessSnapshotProvider.");
  return value;
}

export function useWorkspaceElementAccess(elementKey: string): {
  level: ElementAccessLevel;
  loading: boolean;
  error: string;
  ownerBaseline: boolean;
} {
  const snapshot = useAccessSnapshot();
  return {
    level: snapshot.ownerBaseline ? "manage" : elementAccessLevel(snapshot.capabilities, elementKey),
    loading: snapshot.loading,
    error: snapshot.error,
    ownerBaseline: snapshot.ownerBaseline,
  };
}
