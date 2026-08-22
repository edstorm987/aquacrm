// A block definition, said as source code.
//
// ─── Phase 7: inserting an element WRITES REAL CODE ────────────────────────
//
// Ed: "adding in a section or something will actually add the correct code it
// all gets put in right". On an Aqua-hosted portal, adding an element mutates
// the portal document — correct there, unchanged. On a repository-backed
// website there is no block document: the page IS the source, so adding an
// element means emitting the element as source and committing it (the draft
// branch, `repoWrite.ts`).
//
// This module is ONLY the emission: definition in, lines of JSX or HTML out.
// It is deliberately not a templating system. Everything it writes is derived
// from what the registry already declares — `defaultProps`, the `fields` list
// and their `PropFieldType`s — by a handful of fixed rules:
//
//   • text-ish fields (`text`/`textarea`/`richtext`) become text elements —
//     a heading element when the field is recognisably the block's title,
//     a paragraph otherwise;
//   • a `url` field pairs with its label field (`ctaHref` + `ctaLabel`,
//     `href` + `label`) and the pair becomes one anchor;
//   • an `image` field with a value becomes an <img>;
//   • styling knobs (`select`, `boolean`, `number`, `color`) are settings on
//     a block DOCUMENT, not content — they emit nothing, because inventing a
//     styling framework for somebody else's repository would be a guess;
//   • arrays and objects in `defaultProps` (testimonial items and the like)
//     are skipped for the same reason — there is no honest generic markup
//     for them, and a thin block the operator fills in beats a wrong one.
//     (`defaultChildren` would be skipped too; no shipped definition
//     declares one.)
//
// The output is plain, structural markup — no imports, no identifiers, no
// framework assumptions — so it compiles in ANY .tsx/.jsx/.mdx file and is
// valid in any .html/.md file. That is the honest first slice: the block's
// shape and words land in the file; making it beautiful is the operator's
// (or the editor AI's) next edit. `data-aqua-element` names what it is, so a
// human reading the diff — and the Aqua Tag reading the page — can tell.
//
// Same layering rules as the rest of `src/engines/editor/elements`: type-only
// imports, no server-only, no plugin import — the definition arrives as an
// argument. WHERE the emitted lines may land is not this module's question;
// that is `server/sourceInsert.ts`, which refuses rather than guesses.

import type { BlockDefinition, PropField } from "./definition";

/** The two shapes source can take. Which one is the FILE's decision. */
export type EmitKind = "jsx" | "html";

/**
 * How a file wants its markup. `.tsx/.jsx/.mdx` compile JSX; `.html` and
 * markdown take plain HTML (raw HTML is legal markdown). `null` is "this file
 * cannot take an element at all" — a `.ts` module, a stylesheet — and callers
 * must treat it as a refusal, not a default.
 */
export function emitKindForFile(path: string): EmitKind | null {
  if (/\.(tsx|jsx|mdx)$/i.test(path)) return "jsx";
  if (/\.(html?|md|markdown)$/i.test(path)) return "html";
  return null;
}

// ─── Escaping ──────────────────────────────────────────────────────────────
//
// The same reasoning as `sourceMatch.unsafeCharactersFor`, applied in reverse:
// instead of refusing characters that would change the program, the emitter
// writes them as entities so they CANNOT. Entities are valid in both HTML text
// and JSX text, so one spelling serves both kinds.

function escapeText(value: string, kind: EmitKind): string {
  const base = value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // In JSX, braces open expressions even in bare text.
  return kind === "jsx" ? base.replace(/\{/g, "&#123;").replace(/\}/g, "&#125;") : base;
}

function escapeAttr(value: string): string {
  // Double quotes delimit every attribute this module writes.
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/\{/g, "&#123;");
}

// ─── Reading the definition ────────────────────────────────────────────────

/** The field's default, preferring the block-level `defaultProps` declaration. */
function valueOf(def: Pick<BlockDefinition, "defaultProps">, field: PropField): string {
  const raw = def.defaultProps[field.key] ?? field.default;
  return typeof raw === "string" ? raw : "";
}

const TEXTISH = new Set<PropField["type"]>(["text", "textarea", "richtext"]);

/** `ctaHref` → `ctaLabel`, `href` → `label` — the registry's own naming habit. */
function labelKeyFor(urlKey: string): string | null {
  if (!/href$/i.test(urlKey)) return null;
  return urlKey.replace(/href$/i, match => (match === "Href" ? "Label" : "label"));
}

/** Is this text field the block's own title? Keyed on the names the registry uses. */
function isHeadingField(def: Pick<BlockDefinition, "type">, field: PropField): boolean {
  // `subhead`/`subheading` are sub-titles — paragraphs, not headings.
  if (/head|title/i.test(field.key) && !/sub/i.test(field.key)) return true;
  // The heading block's one field is `text`; the block's TYPE carries the intent.
  return field.key === "text" && /head|title/i.test(def.type);
}

/**
 * A bare CSS length is a styling knob that happens to be typed `text`
 * (`gap: "16px"`, `height: "32px"`) — a measurement, never words on a page.
 */
function isCssLength(value: string): boolean {
  return /^-?\d+(\.\d+)?(px|r?em|%|v[hw])$/i.test(value.trim());
}

// ─── The emitter ───────────────────────────────────────────────────────────

/**
 * One block definition as lines of source, defaults filled in.
 *
 * Deterministic — same definition, same lines — because the preview the
 * operator confirms and the code that lands must be the same text
 * (`publish.ts` makes the same promise about its dry run).
 */
export function emitElementSource(
  def: Pick<BlockDefinition, "type" | "label" | "isContainer" | "defaultProps" | "fields">,
  kind: EmitKind,
): string[] {
  // Pair pass first: `ctaLabel` precedes `ctaHref` in every registry entry,
  // so the label must be claimed BEFORE the text pass reaches it — otherwise
  // the CTA's words emit twice, once as a paragraph and once in the anchor.
  const consumed = new Set<string>();
  const anchors = new Map<string, string>();
  for (const field of def.fields) {
    if (field.type !== "url") continue;
    const labelKey = labelKeyFor(field.key);
    const label = labelKey ? def.fields.find(other => other.key === labelKey && TEXTISH.has(other.type)) : undefined;
    const href = valueOf(def, field);
    const words = label ? valueOf(def, label) : "";
    // A link is only content when it has both an address and words. A bare
    // default like "#" with no label emits nothing rather than a blank <a>.
    if (href && words && label) {
      anchors.set(field.key, `<a href="${escapeAttr(href)}">${escapeText(words, kind)}</a>`);
      consumed.add(label.key);
    }
  }

  const children: string[] = [];
  for (const field of def.fields) {
    if (consumed.has(field.key)) continue;

    if (field.type === "url") {
      const anchor = anchors.get(field.key);
      if (anchor) children.push(anchor);
      continue;
    }

    if (field.type === "image") {
      const src = valueOf(def, field);
      if (src) children.push(`<img src="${escapeAttr(src)}" alt="" />`);
      continue;
    }

    if (TEXTISH.has(field.type)) {
      const words = valueOf(def, field);
      if (!words || isCssLength(words)) continue;
      const tag = isHeadingField(def, field) ? "h2" : "p";
      children.push(`<${tag}>${escapeText(words, kind)}</${tag}>`);
    }
    // select / boolean / number / color: styling knobs, deliberately nothing.
  }

  const marker = `data-aqua-element="${escapeAttr(def.type)}"`;

  // One piece of content IS the element — no wrapper around a lone anchor or
  // paragraph. The marker rides on the element itself.
  if (children.length === 1) {
    return [children[0].replace(/^<([a-zA-Z][a-zA-Z0-9]*)/, `<$1 ${marker}`)];
  }

  if (children.length === 0) {
    // A container, or a block whose defaults are all knobs. The comment says
    // what belongs inside rather than pretending emptiness is finished.
    const note = `${def.label} content`;
    children.push(kind === "jsx" ? `{/* ${note} */}` : `<!-- ${note} -->`);
  }

  return [
    `<section ${marker}>`,
    ...children.map(line => `  ${line}`),
    "</section>",
  ];
}

/** The lines as one string — what travels to the server and into the preview. */
export function emitElementCode(
  def: Pick<BlockDefinition, "type" | "label" | "isContainer" | "defaultProps" | "fields">,
  kind: EmitKind,
): string {
  return emitElementSource(def, kind).join("\n");
}
