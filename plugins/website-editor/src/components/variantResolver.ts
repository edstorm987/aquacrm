"use client";

// Runtime variant resolver for split-tests (X-2).
//
// Each visitor gets a stable id stored in localStorage. For each block
// participating in a split-test group, we hash (visitor-id, group-id)
// → 0..1, compare to the group's traffic %, and pick a variant by
// weight. The same visitor sees the same variant across reloads (cookie
// stickiness) unless the group is set to `session` sticky mode in
// which case we re-roll per session.
//
// Faithful port of `02/src/components/editor/variantResolver.ts`.

import type { Block, BlockVariant } from "../types/block";

const VISITOR_KEY = "lk_visitor_id";
const SESSION_KEY = "lk_session_id";

function ensureId(key: string, persistent: boolean): string {
  if (typeof window === "undefined") return "ssr";
  const store = persistent ? window.localStorage : window.sessionStorage;
  let v = store.getItem(key);
  if (!v) {
    v = (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : `v_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    store.setItem(key, v);
  }
  return v;
}

export function visitorId(): string { return ensureId(VISITOR_KEY, true); }
export function sessionId(): string { return ensureId(SESSION_KEY, false); }

// FNV-1a — small, deterministic, good enough for traffic splitting.
function hash01(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 0) / 0xffffffff;
}

interface ResolveInput {
  block: Block;
  groupId: string;
  trafficPercent?: number;
  stickyBy?: "visitor" | "session";
}

export interface ResolvedVariant {
  variant: BlockVariant | null;
  variantId: string;
}

export function resolveVariant({ block, groupId, trafficPercent = 100, stickyBy = "visitor" }: ResolveInput): ResolvedVariant {
  const variants = block.variantsByGroup?.[groupId] ?? [];
  if (variants.length === 0) return { variant: null, variantId: "control" };

  const id = stickyBy === "session" ? sessionId() : visitorId();
  const trafficSeed = hash01(`${id}::${groupId}::traffic`);
  if (trafficSeed * 100 >= trafficPercent) return { variant: null, variantId: "control" };

  const totalWeight = variants.reduce((acc, v) => acc + (v.weight ?? 1), 0);
  const pickSeed = hash01(`${id}::${groupId}::pick`) * totalWeight;
  let cumulative = 0;
  for (const v of variants) {
    cumulative += v.weight ?? 1;
    if (pickSeed < cumulative) return { variant: v, variantId: v.id };
  }
  const last = variants[variants.length - 1]!;
  return { variant: last, variantId: last.id };
}

export function applyVariant(block: Block, variant: BlockVariant | null): Block {
  if (!variant) return block;
  return {
    ...block,
    props: { ...block.props, ...(variant.props ?? {}) },
    styles: { ...(block.styles ?? {}), ...(variant.styles ?? {}) },
  };
}

export function recordExposure(groupId: string, variantId: string) {
  if (typeof window === "undefined") return;
  void fetch(`/api/portal/split-tests/${encodeURIComponent(groupId)}/exposure`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ variantId }),
    keepalive: true,
  }).catch(() => {});
}

export function recordConversion(groupId: string, variantId: string) {
  if (typeof window === "undefined") return;
  void fetch(`/api/portal/split-tests/${encodeURIComponent(groupId)}/conversion`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ variantId }),
    keepalive: true,
  }).catch(() => {});
}
