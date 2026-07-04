// Device preset library for the editor preview.
//
// Mirrors Chrome DevTools' device toolbar — a curated set of common
// phones, tablets, laptops and desktops, plus a "Responsive" mode that
// lets the operator drag the canvas edges to any size.
//
// Dimensions are CSS-pixels (the viewport size at 1× DPR), portrait
// orientation. The DevicePreview component handles rotation by
// swapping width/height at render time.

export type DeviceCategory = "responsive" | "phone" | "tablet" | "laptop" | "desktop";

export interface DeviceSpec {
  id: string;
  name: string;
  category: DeviceCategory;
  // CSS-pixel dimensions in portrait. Phones are obviously taller than
  // wide; landscape comes from rotating in the toolbar.
  width: number;
  height: number;
  // Optional pixel ratio for high-density preview hints.
  pixelRatio?: number;
  // For mobile devices, a "device chrome" frame can be drawn around
  // the canvas. These coordinates describe the bezel relative to the
  // viewport for that frame.
  bezel?: { top: number; right: number; bottom: number; left: number };
  // Quick badge for the dropdown to nudge the operator (e.g. "Most popular phone").
  hint?: string;
}

export const DEVICE_PRESETS: DeviceSpec[] = [
  // ─── Responsive ──────────────────────────────────────────────────
  { id: "responsive", name: "Responsive (drag to resize)", category: "responsive",
    width: 1280, height: 800 },

  // ─── Phones ──────────────────────────────────────────────────────
  { id: "iphone-se",        name: "iPhone SE",            category: "phone",
    width: 375, height: 667, pixelRatio: 2,
    bezel: { top: 24, right: 8, bottom: 64, left: 8 } },
  { id: "iphone-12",        name: "iPhone 12 / 13 / 14",  category: "phone",
    width: 390, height: 844, pixelRatio: 3,
    bezel: { top: 44, right: 12, bottom: 34, left: 12 },
    hint: "Most-used iPhone size" },
  { id: "iphone-14-pro",    name: "iPhone 14 Pro",        category: "phone",
    width: 393, height: 852, pixelRatio: 3,
    bezel: { top: 44, right: 12, bottom: 34, left: 12 } },
  { id: "iphone-14-pro-max",name: "iPhone 14 Pro Max",    category: "phone",
    width: 430, height: 932, pixelRatio: 3,
    bezel: { top: 44, right: 12, bottom: 34, left: 12 } },
  { id: "iphone-15-pro",    name: "iPhone 15 Pro",        category: "phone",
    width: 393, height: 852, pixelRatio: 3,
    bezel: { top: 44, right: 12, bottom: 34, left: 12 } },
  { id: "pixel-7",          name: "Pixel 7",              category: "phone",
    width: 412, height: 915, pixelRatio: 2.625 },
  { id: "pixel-8-pro",      name: "Pixel 8 Pro",          category: "phone",
    width: 448, height: 998, pixelRatio: 3 },
  { id: "galaxy-s20",       name: "Galaxy S20 Ultra",     category: "phone",
    width: 412, height: 915, pixelRatio: 3.5 },
  { id: "galaxy-s23",       name: "Galaxy S23",           category: "phone",
    width: 360, height: 780, pixelRatio: 3 },
  { id: "galaxy-fold-5",    name: "Galaxy Z Fold 5",      category: "phone",
    width: 344, height: 882, pixelRatio: 3 },

  // ─── Tablets ─────────────────────────────────────────────────────
  { id: "ipad-mini",        name: "iPad Mini",            category: "tablet",
    width: 768, height: 1024, pixelRatio: 2 },
  { id: "ipad-air",         name: "iPad Air",             category: "tablet",
    width: 820, height: 1180, pixelRatio: 2 },
  { id: "ipad-pro-11",      name: "iPad Pro 11\"",        category: "tablet",
    width: 834, height: 1194, pixelRatio: 2 },
  { id: "ipad-pro-13",      name: "iPad Pro 12.9\"",      category: "tablet",
    width: 1024, height: 1366, pixelRatio: 2,
    hint: "Largest tablet — popular with designers" },
  { id: "surface-pro-7",    name: "Surface Pro 7",        category: "tablet",
    width: 912, height: 1368, pixelRatio: 2 },
  { id: "kindle-fire",      name: "Kindle Fire HDX",      category: "tablet",
    width: 800, height: 1280, pixelRatio: 2 },

  // ─── Laptops ─────────────────────────────────────────────────────
  { id: "macbook-air",      name: "MacBook Air 13\"",     category: "laptop",
    width: 1280, height: 832, pixelRatio: 2 },
  { id: "macbook-pro-14",   name: "MacBook Pro 14\"",     category: "laptop",
    width: 1512, height: 982, pixelRatio: 2 },
  { id: "macbook-pro-16",   name: "MacBook Pro 16\"",     category: "laptop",
    width: 1728, height: 1117, pixelRatio: 2 },
  { id: "thinkpad",         name: "ThinkPad / generic 14\"", category: "laptop",
    width: 1366, height: 768 },

  // ─── Desktops ────────────────────────────────────────────────────
  { id: "imac-24",          name: "iMac 24\"",            category: "desktop",
    width: 2240, height: 1260, pixelRatio: 2 },
  { id: "desktop-1080",     name: "1920 × 1080 (FHD)",    category: "desktop",
    width: 1920, height: 1080,
    hint: "Most common desktop size" },
  { id: "desktop-1440",     name: "2560 × 1440 (QHD)",    category: "desktop",
    width: 2560, height: 1440 },
  { id: "desktop-4k",       name: "3840 × 2160 (4K)",     category: "desktop",
    width: 3840, height: 2160 },
  { id: "ultrawide",        name: "3440 × 1440 (ultrawide)", category: "desktop",
    width: 3440, height: 1440 },
];

export const CATEGORY_LABELS: Record<DeviceCategory, string> = {
  responsive: "Responsive",
  phone: "Phones",
  tablet: "Tablets",
  laptop: "Laptops",
  desktop: "Desktops",
};

export function getDevicePreset(id: string): DeviceSpec | undefined {
  return DEVICE_PRESETS.find(d => d.id === id);
}

// Persistent operator preference — sticks across editor sessions.
const STORAGE_KEY = "lk_editor_device_v1";

export interface DeviceState {
  deviceId: string;
  rotated: boolean;             // true → landscape (width/height swapped)
  zoom: number;                 // 0.25 .. 1.5; 1 = 100%
  showChrome: boolean;          // draw decorative bezels for phones
  customWidth?: number;         // overrides preset when in responsive mode
  customHeight?: number;
}

const DEFAULT_STATE: DeviceState = {
  deviceId: "responsive",
  rotated: false,
  zoom: 1,
  showChrome: false,
};

export function loadDeviceState(): DeviceState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<DeviceState>;
    return { ...DEFAULT_STATE, ...parsed };
  } catch { return DEFAULT_STATE; }
}

export function saveDeviceState(state: DeviceState): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

// Compute the effective rendered viewport given a preset + state. The
// canvas reads from this; rotation, custom-resize and zoom all flow
// through here so the rendered pixel maths is consistent.
export function effectiveViewport(spec: DeviceSpec, state: DeviceState): { width: number; height: number } {
  if (spec.id === "responsive") {
    return {
      width: state.customWidth ?? spec.width,
      height: state.customHeight ?? spec.height,
    };
  }
  if (state.rotated) {
    return { width: spec.height, height: spec.width };
  }
  return { width: spec.width, height: spec.height };
}
