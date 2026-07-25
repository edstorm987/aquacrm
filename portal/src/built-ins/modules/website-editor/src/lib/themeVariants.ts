"use client";

// Theme variant catalogue. Lightweight shim for the SitesPage admin
// (R4): exposes the small public API the page consumes — `listVariants`,
// `getVariant`, `getActiveVariantId`, `setActiveVariantId`,
// `getSiteDefaultVariantId`, `setSiteDefaultVariantId`. The variant
// shape itself (id/name/icon/description/isBuiltIn) is preserved
// from 02; deep-merge `overrides` payload is opaque (the foundation's
// theme system reads it).
//
// 02's full theme variant editor (CRUD + preview) belongs to a future
// theme-variants admin page that's not in R4 scope. This shim returns
// a small built-in catalogue (Default/Light/Dark/Sand/Midnight) so the
// SitesPage theme picker has something to show.
//
// Round-1 light/dark/system selector kept as separate
// `ThemeAppearance` type so existing callers don't break.

export interface ThemeVariant {
  id: string;
  name: string;
  icon: string;
  description: string;
  isBuiltIn: boolean;
  overrides: Record<string, unknown>;
  createdAt: number;
}

export type ThemeAppearance = "light" | "dark" | "system";

const STORAGE_KEY = "lk_theme_variants_v1";
const ACTIVE_KEY = "lk_active_theme_variant_v1";
const DEFAULT_KEY_PREFIX = "lk_site_default_variant_";
const APPEARANCE_KEY = "aqua.editor.themeVariant";
const EVENT = "lk-theme-variants-change";

export const BUILT_IN_VARIANTS: ThemeVariant[] = [
  { id: "default",  name: "Default",  icon: "✦", description: "The base palette + typography.",     isBuiltIn: true, overrides: {}, createdAt: 0 },
  { id: "light",    name: "Light",    icon: "☀", description: "Cream background, dark ink.",         isBuiltIn: true, overrides: { mode: "light" }, createdAt: 0 },
  { id: "dark",     name: "Dark",     icon: "☾", description: "Charcoal background, cream ink.",     isBuiltIn: true, overrides: { mode: "dark" }, createdAt: 0 },
  { id: "sand",     name: "Sand",     icon: "✺", description: "Warm desert palette.",                isBuiltIn: true, overrides: { mode: "sand" }, createdAt: 0 },
  { id: "midnight", name: "Midnight", icon: "✦", description: "Deep blue palette.",                  isBuiltIn: true, overrides: { mode: "midnight" }, createdAt: 0 },
];

interface Store { variants: ThemeVariant[] }

function read(): Store {
  if (typeof window === "undefined") return { variants: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { variants: [] };
    return JSON.parse(raw) as Store;
  } catch { return { variants: [] }; }
}

function write(s: Store): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  window.dispatchEvent(new Event(EVENT));
}

export function listVariants(): ThemeVariant[] {
  return [...BUILT_IN_VARIANTS, ...read().variants];
}

export function getVariant(id: string): ThemeVariant | null {
  return listVariants().find(v => v.id === id) ?? null;
}

export function createVariant(name: string, sourceId?: string): ThemeVariant {
  const source = sourceId ? getVariant(sourceId) : null;
  const variant: ThemeVariant = {
    id: `var_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    name,
    icon: "✦",
    description: source ? `Based on ${source.name}` : "Custom variant",
    isBuiltIn: false,
    overrides: source ? { ...source.overrides } : {},
    createdAt: Date.now(),
  };
  const s = read();
  s.variants.push(variant);
  write(s);
  return variant;
}

export function updateVariant(id: string, patch: Partial<ThemeVariant>): void {
  const s = read();
  const i = s.variants.findIndex(v => v.id === id);
  if (i < 0) return;
  const cur = s.variants[i];
  if (!cur) return;
  s.variants[i] = { ...cur, ...patch };
  write(s);
}

export function deleteVariant(id: string): void {
  const s = read();
  s.variants = s.variants.filter(v => v.id !== id);
  write(s);
}

// ─── Active / per-site default cursors ────────────────────────────────────

export function getActiveVariantId(): string {
  if (typeof window === "undefined") return "default";
  return window.localStorage.getItem(ACTIVE_KEY) ?? "default";
}

export function setActiveVariantId(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_KEY, id);
  window.dispatchEvent(new Event(EVENT));
}

export function getSiteDefaultVariantId(siteId?: string): string {
  if (typeof window === "undefined") return "default";
  const key = siteId ? `${DEFAULT_KEY_PREFIX}${siteId}` : ACTIVE_KEY;
  return window.localStorage.getItem(key) ?? "default";
}

export function setSiteDefaultVariantId(siteId: string, id: string): void {
  if (typeof window === "undefined") return;
  const key = `${DEFAULT_KEY_PREFIX}${siteId}`;
  window.localStorage.setItem(key, id);
  window.dispatchEvent(new Event(EVENT));
}

export function onVariantsChange(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

// ─── Round-1 light/dark/system selector (kept for back-compat) ────────────

export function getThemeVariant(): ThemeAppearance {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(APPEARANCE_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

export function setThemeVariant(v: ThemeAppearance): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(APPEARANCE_KEY, v);
}
