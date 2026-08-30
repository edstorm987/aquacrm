// The nav's colour vocabulary — the hover and active tints a saved tab can take.
//
// Ed, 2026-08-29: *"we should be able to edit hover colours too… this way I can
// make my own sidebars however I want."*
//
// ── Keys, not colours ─────────────────────────────────────────────────────
//
// A saved tab stores a KEY from this list, never a raw `#hex`. Two reasons, and
// both bite later rather than now:
//
//   • the value is rendered into a style attribute from a record that
//     round-trips through JSON and comes back from storage — a stored string
//     that reaches CSS is a value somebody has to keep trustworthy for ever,
//     whereas a key is checked against this map and an unknown one is simply
//     ignored;
//   • a hex freezes today's palette into a saved record. A redesign would
//     leave every personalised tab wearing the old scheme, and there would be
//     nothing to migrate them BY. A key re-resolves every render.
//
// This is the same rule `icon` already follows, for the same reasons.
//
// ── Why these colours ─────────────────────────────────────────────────────
//
// `--nav-tone` is mixed into the hover background, the active rail and the icon
// tint by `globals.css`, in light and dark. So a tone has to read at 9%
// opacity on a dark panel AND at full strength as a 3px rail. Muted mid-tones
// do both; a pastel vanishes at 9% and a neon screams at 100%.

export interface NavTone {
  key: string;
  label: string;
  /** The value assigned to `--nav-tone`. */
  color: string;
}

export const NAV_TONES: NavTone[] = [
  { key: "amber",   label: "Amber",   color: "#f59e0b" },
  { key: "teal",    label: "Teal",    color: "#0b6f6d" },
  { key: "sky",     label: "Sky",     color: "#0284c7" },
  { key: "indigo",  label: "Indigo",  color: "#4f46e5" },
  { key: "violet",  label: "Violet",  color: "#7c3aed" },
  { key: "rose",    label: "Rose",    color: "#e11d48" },
  { key: "emerald", label: "Emerald", color: "#059669" },
  { key: "orange",  label: "Orange",  color: "#ea580c" },
  { key: "slate",   label: "Slate",   color: "#475569" },
];

const BY_KEY = new Map(NAV_TONES.map(tone => [tone.key, tone]));

/**
 * The colour for a stored key, or undefined.
 *
 * Undefined for an unknown key is deliberate and is the whole safety story: a
 * record carrying anything that is not in this map — a stale key from an older
 * palette, or a string somebody put there by hand — falls back to the shell's
 * own tone rather than reaching CSS.
 */
export function navToneColor(key: string | undefined): string | undefined {
  if (!key) return undefined;
  return BY_KEY.get(key)?.color;
}

/**
 * The `style` a row carrying this tone should get.
 *
 * Returns an empty object rather than `undefined` so callers can spread it
 * unconditionally — a tone-less row must render exactly as it did before this
 * feature existed, with no `--nav-tone` of its own at all.
 */
export function navToneStyle(key: string | undefined): React.CSSProperties {
  const color = navToneColor(key);
  return color ? ({ "--nav-tone": color } as React.CSSProperties) : {};
}
