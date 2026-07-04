"use client";

const SECTIONS_KEY = "lk_admin_sections_v1";
const CHANGE_EVENT = "lk-sections-change";

export interface SectionDef {
  id: string;
  label: string;
  description: string;
  visible: boolean;
  locked?: boolean; // can't be hidden or moved
}

export const DEFAULT_SECTIONS: SectionDef[] = [
  { id: "hero",          label: "Hero",               description: "Full-screen headline and CTA",        visible: true, locked: true },
  { id: "social",        label: "Social strip",        description: "Social proof / marquee bar",          visible: true },
  { id: "featured",      label: "Featured products",   description: "3-product showcase grid",             visible: true },
  { id: "problem",       label: "The problem",         description: "Problem statement narrative",         visible: true },
  { id: "solution",      label: "Heritage / solution", description: "Solution and brand story section",    visible: true },
  { id: "shop",          label: "Shop",                description: "Full product browse grid",            visible: true },
  { id: "testimonials",  label: "Testimonials",        description: "Customer reviews marquee",            visible: true },
];

function read(): SectionDef[] {
  if (typeof window === "undefined") return DEFAULT_SECTIONS;
  try {
    const raw = localStorage.getItem(SECTIONS_KEY);
    if (!raw) return DEFAULT_SECTIONS;
    const saved = JSON.parse(raw) as Array<{ id: string; visible: boolean }>;
    // Merge saved order/visibility with defaults (preserves new sections added in code)
    const savedMap = new Map(saved.map((s) => [s.id, s]));
    const ordered: SectionDef[] = [];
    // First: sections in saved order
    for (const s of saved) {
      const def = DEFAULT_SECTIONS.find((d) => d.id === s.id);
      if (def) ordered.push({ ...def, visible: s.visible });
    }
    // Then: any new defaults not yet in saved
    for (const def of DEFAULT_SECTIONS) {
      if (!savedMap.has(def.id)) ordered.push(def);
    }
    return ordered;
  } catch {
    return DEFAULT_SECTIONS;
  }
}

function write(sections: SectionDef[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    SECTIONS_KEY,
    JSON.stringify(sections.map((s) => ({ id: s.id, visible: s.visible })))
  );
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function getSections(): SectionDef[] {
  return read();
}

export function saveSections(sections: SectionDef[]) {
  write(sections);
}

export function setSectionVisible(id: string, visible: boolean) {
  const sections = read();
  const idx = sections.findIndex((s) => s.id === id);
  if (idx < 0) return;
  const current = sections[idx];
  if (!current) return;
  sections[idx] = { ...current, visible };
  write(sections);
}

export function moveSectionUp(id: string) {
  const sections = read();
  const idx = sections.findIndex((s) => s.id === id);
  if (idx <= 0) return;
  const target = idx - 1;
  if (sections[target]?.locked) return;
  const a = sections[idx - 1]!;
  const b = sections[idx]!;
  sections[idx - 1] = b;
  sections[idx] = a;
  write(sections);
}

export function moveSectionDown(id: string) {
  const sections = read();
  const idx = sections.findIndex((s) => s.id === id);
  if (idx < 0 || idx >= sections.length - 1) return;
  const target = idx + 1;
  if (sections[target]?.locked) return;
  const a = sections[idx]!;
  const b = sections[idx + 1]!;
  sections[idx] = b;
  sections[idx + 1] = a;
  write(sections);
}

export function onSectionsChange(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
