// The client portal's 16 block types, expressed in the shared vocabulary.
//
// ELEMENT ENGINE P3. Before this file there were two block registries:
// `BLOCK_REGISTRY` in the website-editor plugin (70 entries) and
// `CLIENT_PORTAL_BLOCK_REGISTRY` in `src/lib/portal/clientPortalBuilder.ts` (16). Of
// those 16, FOURTEEN were the same element under a different name — a hero is a
// hero, a portal `callout` is a website `banner`, a portal `rich-text` is a
// website `text`. The only things the portal had that the website did not were
// `approval-panel` and `file-upload`.
//
// What actually distinguishes a portal block from a website block is DATA
// BINDING, not shape. So the merge is not "copy 14 definitions across". It is:
//
//   • 14 portal names become ALIASES of an element that already exists. The
//     shared definition gains `"portal"` in its `surfaces`; no second entry is
//     created, so there is exactly one `hero` in the registry and one `banner`.
//   • 2 genuinely new concepts get real definitions with `surfaces: ["portal"]`.
//   • The per-type authoring defaults — which used to be an if-ladder in
//     `createPortalBlock` plus two more ladders in `blockTitle`/`blockBody` —
//     become one declaration per type, right here, next to the alias.
//
// ── What this file is NOT ─────────────────────────────────────────────────
//
// It is not a renderer. Live client portals render through
// `src/app/portal/customer/_PortalPageComposition.tsx` and the interaction
// components beside it, and P3 deliberately did not touch them: a merge that
// changes one character of what a signed-in client sees is a failure even with
// a green suite. `scripts/smoke-portal-element-parity.test.ts` renders every
// portal block type to real HTML and requires it byte-identical to the
// pre-merge capture. That harness is the reason this file could be written at
// all, and it is what must stay green.
//
// The two portal-only definitions therefore register a NULL renderer, on
// purpose — see the note on `portalHostElement` below. Writing a second
// implementation of the approval panel here so the registry "looks complete"
// would recreate the exact duplication this phase exists to delete.
//
// ── Layering ──────────────────────────────────────────────────────────────
//
// Same rules as the rest of `src/engines/editor/elements`: no `server-only`, no plugin
// import, nothing that breaks under `--conditions react-server`. In particular
// this module must NOT import the website-editor plugin to reach the 70
// definitions it aliases — the alias is resolved through the shared registry at
// call time, and `portalVocabularyProblems()` is how a missing one is caught
// loudly instead of silently.

import type {
  ClientPortalBlockAlignment,
  ClientPortalBlockDataSource,
  ClientPortalBlockSpacing,
  ClientPortalBlockTone,
  ClientPortalBlockType,
  ClientPortalBlockVisibilityRule,
  ClientPortalBlockWidth,
  ClientPortalMediaAspect,
  ClientPortalMediaFit,
  ClientPortalPageBlock,
  ClientPortalProductMatch,
} from "@/server/types";
import type { Block, BlockType, ElementBinding, ElementVisibility } from "./block";
import type { BlockDefinition, PropField } from "./definition";
import { servesSurface } from "./definition";
import { getElementDefinition, registerElementDefinitions } from "./registry";
import type { ElementSchema } from "./schema";
import { buildElementSchema, validateElementProps } from "./schema";

// ─── The pairing table ────────────────────────────────────────────────────

export type PortalElementCategory = "content" | "live-data" | "layout";

/** The authoring defaults for one portal type — the stored record, minus its id. */
export interface PortalElementDefaults {
  tone?: ClientPortalPageBlock["tone"];
  eyebrow?: string;
  title?: string;
  body?: string;
  actionLabel?: string;
  actionHref?: string;
  dataSource?: ClientPortalBlockDataSource;
  requestType?: ClientPortalPageBlock["requestType"];
  approvalType?: ClientPortalPageBlock["approvalType"];
  uploadCategory?: ClientPortalPageBlock["uploadCategory"];
  /** `true` seeds the one starter item `link-list` has always shipped with. */
  starterItem?: boolean;
  media?: boolean;
  extension?: boolean;
}

export interface PortalElementPairing {
  /** The portal's name for this element — the value stored in `block.type`. */
  type: ClientPortalBlockType;
  /**
   * The shared element this is the portal's name for.
   *
   * `null` means the concept is genuinely new and owns a registry entry of its
   * own. Everything else points at a type the website already ships, and
   * `portalVocabularyProblems()` fails if that type is not registered or does
   * not serve the portal surface.
   *
   * Two portal names may legitimately point at ONE element: `link-list` and
   * `product-hub` are both a grid of cards. That is a fact about the portal's
   * vocabulary, not a mistake — it is exactly the duplication that having two
   * registries hid.
   */
  alias: BlockType | null;
  label: string;
  description: string;
  category: PortalElementCategory;
  /**
   * Offered in the portal palette. `system-content` is false: it is a
   * passthrough shim that renders the operational page, not a concept an
   * operator inserts.
   */
  palette: boolean;
  defaults: PortalElementDefaults;
}

/**
 * Every portal type, in palette order.
 *
 * ORDER IS LOAD-BEARING — `CLIENT_PORTAL_BLOCK_REGISTRY` is derived from this
 * and the portal studio renders the palette in array order. `system-content`
 * sits last and out of the palette.
 */
export const PORTAL_ELEMENT_PAIRINGS = [
  {
    type: "hero", alias: "hero", palette: true, category: "content",
    label: "Feature hero", description: "A strong introduction with an optional action.",
    defaults: {
      tone: "dark",
      title: "A space shaped around your work.",
      body: "Bring the right context, decisions, and next steps together in one calm client experience.",
    },
  },
  {
    type: "rich-text", alias: "text", palette: true, category: "content",
    label: "Text section", description: "Long-form guidance, context, or a client note.",
    defaults: {
      title: "A note for your journey",
      body: "Add the context your client needs here. Tokens such as {firstName} and {providerName} remain dynamic.",
    },
  },
  {
    type: "callout", alias: "banner", palette: true, category: "content",
    label: "Callout", description: "A focused message with an optional destination.",
    defaults: {
      title: "The next important thing",
      body: "Use this panel to draw attention to a decision, deadline, or next move.",
    },
  },
  {
    type: "image", alias: "image", palette: true, category: "content",
    label: "Image", description: "A responsive image with accessible alternative text and caption.",
    defaults: { eyebrow: "", title: "Image", body: "", media: true },
  },
  {
    type: "video", alias: "video-embed", palette: true, category: "content",
    label: "Video", description: "A direct video, YouTube or Vimeo embed with a controlled frame.",
    defaults: { eyebrow: "", title: "Video", body: "", media: true },
  },
  {
    type: "metrics", alias: "stats-bar", palette: true, category: "live-data",
    label: "Live metrics", description: "A read-only summary bound to current portal records.",
    defaults: { title: "At a glance", dataSource: "portal-summary" },
  },
  {
    type: "service-grid", alias: "feature-grid", palette: true, category: "live-data",
    label: "Service grid", description: "The products and service systems assigned to this client.",
    defaults: { title: "Your connected services" },
  },
  {
    type: "product-hub", alias: "card-grid", palette: true, category: "live-data",
    label: "Product hub", description: "A responsive launchpad into every assigned product's bespoke workspace.",
    defaults: { title: "Your service workspaces" },
  },
  {
    type: "file-list", alias: "blog-feed", palette: true, category: "live-data",
    label: "Latest files", description: "The newest files already shared with the client.",
    defaults: { title: "Latest shared files" },
  },
  {
    type: "activity", alias: "timeline", palette: true, category: "live-data",
    label: "Activity stream", description: "Recent client-visible portal updates.",
    defaults: { title: "Recent progress" },
  },
  {
    type: "request-form", alias: "contact-form", palette: true, category: "live-data",
    label: "Client request", description: "A real request form connected to the client's support and activity records.",
    defaults: {
      eyebrow: "Send a request",
      title: "Tell us what you need",
      body: "Share the context once and it will join your live project record.",
      actionLabel: "Send request",
      requestType: "choose",
    },
  },
  {
    // GENUINELY NEW — no website element does this.
    type: "approval-panel", alias: null, palette: true, category: "live-data",
    label: "Decision panel", description: "Live design or launch approvals the signed-in client can answer.",
    defaults: {
      eyebrow: "Decisions",
      title: "Your approvals",
      body: "Review each decision and keep the work moving with a clear response.",
      approvalType: "all",
    },
  },
  {
    // GENUINELY NEW — no website element does this.
    type: "file-upload", alias: null, palette: true, category: "live-data",
    label: "File drop", description: "A secure upload surface connected to the client's project files.",
    defaults: {
      eyebrow: "Project files",
      title: "Share a file",
      body: "Upload the context, inspiration, or recording the team needs.",
      actionLabel: "Upload file",
      uploadCategory: "brief",
    },
  },
  {
    type: "link-list", alias: "card-grid", palette: true, category: "content",
    label: "Link collection", description: "A curated set of destinations or resources.",
    defaults: { title: "Useful destinations", starterItem: true },
  },
  {
    type: "custom-extension", alias: "html", palette: true, category: "content",
    label: "Custom extension", description: "A sandboxed HTML, CSS and JavaScript component placed inside this page.",
    defaults: { eyebrow: "", title: "Custom portal component", body: "", extension: true },
  },
  {
    type: "divider", alias: "divider", palette: true, category: "layout",
    label: "Divider", description: "A restrained visual break between sections.",
    defaults: { title: "Section break" },
  },
  {
    // The shim. Not a concept, not in the palette, and never aliased: it stands
    // for "render the operational page here", which is a host instruction
    // rather than an element.
    type: "system-content", alias: null, palette: false, category: "layout",
    label: "Live workspace", description: "The protected block that renders the operational, data-backed page.",
    defaults: {
      tone: "quiet",
      eyebrow: "",
      title: "Live portal workspace",
      body: "The secure, data-backed portal page is rendered here.",
    },
  },
] as const satisfies readonly PortalElementPairing[];

/** Every type the table declares, as a literal union. */
type DeclaredPortalType = (typeof PORTAL_ELEMENT_PAIRINGS)[number]["type"];

// ─── The exhaustiveness check ─────────────────────────────────────────────
//
// `ClientPortalBlockType` stops being the only place the portal's vocabulary is
// written down, so it has to stay the thing the table is checked AGAINST — the
// design is explicit that the union survives as a `satisfies` check so a typo
// still fails to compile.
//
// The map below is built by `Object.fromEntries`, which cannot produce a
// checked `Record` and needs an assertion. An assertion on its own would
// happily accept a table missing half its rows, so it is NOT the check — these
// two lines are. Misspell a `type` and it drops out of `DeclaredPortalType`,
// leaving a member of `ClientPortalBlockType` unaccounted for; add a type to
// `ClientPortalBlockType` and forget the pairing, and the same thing happens.
// Either way this declaration stops compiling.

type MissingPairing = Exclude<ClientPortalBlockType, DeclaredPortalType>;
type UnknownPairing = Exclude<DeclaredPortalType, ClientPortalBlockType>;
const PAIRINGS_ARE_EXHAUSTIVE: [MissingPairing, UnknownPairing] extends [never, never] ? true : never = true;
void PAIRINGS_ARE_EXHAUSTIVE;

export const PORTAL_ELEMENT_BY_TYPE: Record<ClientPortalBlockType, PortalElementPairing> =
  Object.fromEntries(PORTAL_ELEMENT_PAIRINGS.map(pairing => [pairing.type, pairing])) as
    Record<ClientPortalBlockType, PortalElementPairing>;

export function portalElementPairing(type: ClientPortalBlockType): PortalElementPairing {
  // The fallback is the `rich-text` pairing, matching what `blockTitle` and
  // `normalisePortalBuilder` have always done with something unrecognised. It
  // is PORTAL-SURFACE fail-soft and stops here — `getElementDefinition` still
  // returns undefined for an unknown type, so a typo stays visible everywhere
  // else.
  return PORTAL_ELEMENT_BY_TYPE[type] ?? PORTAL_ELEMENT_BY_TYPE["rich-text"];
}

/** The shared element a portal type is a name for. `undefined` while unregistered. */
export function portalElementDefinition(type: ClientPortalBlockType): BlockDefinition | undefined {
  const pairing = PORTAL_ELEMENT_BY_TYPE[type];
  if (!pairing) return undefined;
  return getElementDefinition(pairing.alias ?? pairing.type);
}

// ─── The portal's own prop vocabulary ─────────────────────────────────────
//
// ELEMENT ENGINE P5. P3 merged the *list* of placeable things. The portal kept
// its own, independent declaration of what a placeable thing's VALUES may be:
// TWELVE hand-written `Set`s at the top of `clientPortalBuilder.ts` plus a
// scattering of length caps buried in `normaliseBlocks`. That was registry B's
// last piece in the STORE — a second answer to "is this a legal value for this
// prop", sitting parallel to the shared `PropField`/`ElementSchema` contract
// and invisible to it.
//
// ── What this does NOT yet converge (be exact about it) ───────────────────
//
// The portal's block inspector in `src/engines/editor/DevEditor.tsx` (see
// `PortalBlockInspector` and `PortalMediaBlockEditor`) still hand-writes the
// SAME vocabulary a third time: its own `<SelectField options={[…]}>` literals
// for width, tone, spacing, alignment, visibility rule, product match, request
// type, approval type, upload category, data source and media aspect/fit. Those
// literals are not checked against the persisted unions either, so adding a
// member below is a compile error here and still a silent omission there.
//
// It is deliberately NOT converged in this pass, for one reason: the panel's
// option LABELS are authored operator copy ("Full width", "For every client",
// "Let the client choose"), not the derived `optionLabel()` text below, so
// pointing the panel at these tables would change what an operator reads. That
// is a product decision, not a move. Until it is taken, the panel is a known
// third copy — recorded here rather than left to be discovered.
//
// Two things were wrong with it, and both are fixed by moving the declaration
// here:
//
//   • `validateElementProps` could say NOTHING about a portal block. A portal
//     `hero` resolves through its alias to the WEBSITE `hero`, whose fields
//     describe website props (`heading`, `subheading`, …), not `tone`/`eyebrow`
//     /`body`. `portalElementSchema()` below is the portal's own generated
//     contract, which is what an assistant has to plan against before it can
//     propose a portal page (P6).
//
//   • The old `Set`s were NOT checked against the persisted unions. Adding a
//     tone to `ClientPortalBlockTone` compiled cleanly and then silently
//     coerced back to `"surface"` in the normaliser, because nothing tied the
//     two together. `closedSet<T>()` below makes that a compile error.
//
// One table per side-channel `toElement` splits a stored block into, so the
// vocabulary and the shape agree by construction:
//
//   PORTAL_PROP_FIELDS        → block props        (tone, width, title, body…)
//   PORTAL_BINDING_FIELDS     → block.binding      (which records)
//   PORTAL_VISIBILITY_FIELDS  → block.visibility   (who sees it)
//   PORTAL_RESPONSIVE_FIELDS  → block.responsive
//   PORTAL_MEDIA_FIELDS       → block.media
//
// `clientPortalBuilder` builds its normaliser sets and caps from these. The
// stored record and the live HTML are unchanged, and
// `scripts/smoke-portal-element-parity.test.ts` is what says so.
//
// NOT folded in here, deliberately: the `items[]` row caps and the `extension`
// sandbox payload caps. They stay in the normaliser because they describe a
// list row and a script payload, not authored props of the block — a prop-field
// table naming `html` or `javascript` would describe a shape that does not
// exist and would be read as one an assistant may propose.

/**
 * A closed value list, checked against the persisted union.
 *
 * Miss a member and `Exclude<...>` is not `never`, so the argument type
 * collapses to `never` and the call stops compiling. This is the check the
 * eleven hand-written `Set`s never had.
 */
function closedSet<T extends string>() {
  return <const V extends readonly T[]>(values: Exclude<T, V[number]> extends never ? V : never): V => values;
}

export const PORTAL_WIDTHS = closedSet<ClientPortalBlockWidth>()(["full", "half"]);
export const PORTAL_TONES = closedSet<ClientPortalBlockTone>()(["surface", "dark", "accent", "quiet"]);
export const PORTAL_SPACINGS = closedSet<ClientPortalBlockSpacing>()(["none", "compact", "comfortable", "spacious"]);
export const PORTAL_ALIGNMENTS = closedSet<ClientPortalBlockAlignment>()(["left", "center"]);
export const PORTAL_DATA_SOURCES = closedSet<ClientPortalBlockDataSource>()(["portal-summary", "delivery", "billing", "results"]);
export const PORTAL_VISIBILITY_RULES = closedSet<ClientPortalBlockVisibilityRule>()([
  "always", "with-products", "without-products", "single-product", "multiple-products", "specific-products",
]);
export const PORTAL_PRODUCT_MATCHES = closedSet<ClientPortalProductMatch>()(["any", "all"]);
export const PORTAL_REQUEST_TYPES = closedSet<NonNullable<ClientPortalPageBlock["requestType"]>>()([
  "choose", "suggestion", "design-feedback", "support-ticket", "cancel", "move-provider",
]);
export const PORTAL_APPROVAL_TYPES = closedSet<NonNullable<ClientPortalPageBlock["approvalType"]>>()(["all", "design", "launch"]);
export const PORTAL_UPLOAD_CATEGORIES = closedSet<NonNullable<ClientPortalPageBlock["uploadCategory"]>>()([
  "brief", "recording", "inspiration", "design-feedback", "misc",
]);
export const PORTAL_MEDIA_ASPECTS = closedSet<ClientPortalMediaAspect>()(["landscape", "square", "portrait"]);
export const PORTAL_MEDIA_FITS = closedSet<ClientPortalMediaFit>()(["cover", "contain"]);

/**
 * The character caps the normaliser truncates at.
 *
 * ONE declaration: the `PropField`s below carry these as `maxLength`, and
 * `normaliseBlocks` slices at the same numbers. They used to be bare literals
 * buried in the normaliser, so nothing that wanted to STATE the cap could reach
 * it.
 *
 * Not yet true of the editor: `DevEditor`'s portal `Field` takes no `maxLength`
 * at all, so an operator can still type past a cap and have the store silently
 * truncate it on save. Wiring that up is a visible behaviour change to the
 * inspector and belongs with the panel convergence noted above, not here.
 */
export const PORTAL_TEXT_LIMITS = {
  eyebrow: 100,
  title: 180,
  body: 1_200,
  actionLabel: 80,
  actionHref: 500,
  mediaUrl: 1_000,
  mediaAlt: 240,
  mediaCaption: 500,
} as const;

/** Turn `"with-products"` into `"With products"` for a palette label. */
function optionLabel(value: string): string {
  const words = value.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function selectField(key: string, label: string, values: readonly string[]): PropField {
  return { key, label, type: "select", options: values.map(value => ({ value, label: optionLabel(value) })) };
}

/** The authored props of a portal block — what an operator (or an assistant) writes. */
export const PORTAL_PROP_FIELDS: readonly PropField[] = [
  { key: "visible", label: "Visible", type: "boolean" },
  selectField("width", "Width", PORTAL_WIDTHS),
  selectField("tone", "Tone", PORTAL_TONES),
  { key: "eyebrow", label: "Eyebrow", type: "text", maxLength: PORTAL_TEXT_LIMITS.eyebrow },
  { key: "title", label: "Title", type: "text", maxLength: PORTAL_TEXT_LIMITS.title },
  { key: "body", label: "Body", type: "textarea", maxLength: PORTAL_TEXT_LIMITS.body },
  { key: "actionLabel", label: "Button label", type: "text", maxLength: PORTAL_TEXT_LIMITS.actionLabel },
  { key: "actionHref", label: "Button link", type: "url", maxLength: PORTAL_TEXT_LIMITS.actionHref },
];

/** Which records a block reads. Stored flat; `toElement` moves these to `binding`. */
export const PORTAL_BINDING_FIELDS: readonly PropField[] = [
  selectField("dataSource", "Live data", PORTAL_DATA_SOURCES),
  selectField("requestType", "Request type", PORTAL_REQUEST_TYPES),
  selectField("approvalType", "Decisions shown", PORTAL_APPROVAL_TYPES),
  selectField("uploadCategory", "Upload category", PORTAL_UPLOAD_CATEGORIES),
];

/** Who sees the block. `toElement` moves these to `visibility`. */
export const PORTAL_VISIBILITY_FIELDS: readonly PropField[] = [
  selectField("visibilityRule", "Who sees it", PORTAL_VISIBILITY_RULES),
  selectField("productMatch", "Product match", PORTAL_PRODUCT_MATCHES),
];

/** `block.responsive`. */
export const PORTAL_RESPONSIVE_FIELDS: readonly PropField[] = [
  { key: "hideOnMobile", label: "Hide on mobile", type: "boolean" },
  { key: "hideOnDesktop", label: "Hide on desktop", type: "boolean" },
  selectField("spacing", "Spacing", PORTAL_SPACINGS),
  selectField("alignment", "Alignment", PORTAL_ALIGNMENTS),
];

/** `block.media`, on the two types that carry one. */
export const PORTAL_MEDIA_FIELDS: readonly PropField[] = [
  { key: "url", label: "Media URL", type: "url", maxLength: PORTAL_TEXT_LIMITS.mediaUrl },
  { key: "alt", label: "Alternative text", type: "text", maxLength: PORTAL_TEXT_LIMITS.mediaAlt },
  { key: "caption", label: "Caption", type: "text", maxLength: PORTAL_TEXT_LIMITS.mediaCaption },
  selectField("aspect", "Aspect", PORTAL_MEDIA_ASPECTS),
  selectField("fit", "Fit", PORTAL_MEDIA_FITS),
];

/**
 * The four side-channel tables, as generated schemas.
 *
 * `portalElementSchema` covers the AUTHORED props only, and deliberately so:
 * `requestType` is a legal value on `request-form` and on nothing else, so a
 * flat per-type schema naming it would describe a shape that does not exist —
 * exactly what the prop table refuses to do for `html`/`javascript`.
 *
 * That left the other four tables declared and read by nobody, which is the
 * dead-declaration hazard this directory exists to delete. So they are
 * generated once here and CHECKED, per channel, by `portalVocabularyProblems`
 * against every type's real stored record. A default `spacing` or media `fit`
 * outside its closed list is now a named problem rather than a silent coercion.
 */
const PORTAL_SIDE_CHANNEL_SCHEMAS = {
  binding: sideChannelSchema("portal:binding", PORTAL_BINDING_FIELDS),
  visibility: sideChannelSchema("portal:visibility", PORTAL_VISIBILITY_FIELDS),
  responsive: sideChannelSchema("portal:responsive", PORTAL_RESPONSIVE_FIELDS),
  media: sideChannelSchema("portal:media", PORTAL_MEDIA_FIELDS),
} as const;

export type PortalSideChannel = keyof typeof PORTAL_SIDE_CHANNEL_SCHEMAS;

function sideChannelSchema(type: string, fields: readonly PropField[]): ElementSchema {
  return buildElementSchema({
    type,
    fields: [...fields],
    // No defaults: a side channel's defaults live on the type's own record, and
    // `portalVocabularyProblems` validates that record against this schema.
    defaultProps: {},
    isContainer: false,
    surfaces: ["portal"],
  });
}

/** The generated contract for one of a portal block's side channels. */
export function portalSideChannelSchema(channel: PortalSideChannel): ElementSchema {
  return PORTAL_SIDE_CHANNEL_SCHEMAS[channel];
}

const PORTAL_SCHEMA_CACHE = new Map<string, ElementSchema>();

/**
 * The portal's machine-checkable contract for one of its types.
 *
 * NOT a registry entry — adding sixteen of those is exactly the second registry
 * P3 deleted. It is a generated view: the portal's prop fields, with this
 * type's own authoring defaults, run through the same `buildElementSchema` the
 * website definitions use. `undeclared` therefore names the stored keys that
 * are not authored props (`items`, `media`, `dataSource`, `responsive`, …), so
 * a caller can see they exist rather than discovering them by surprise.
 *
 * This is what `validateElementProps` needs to answer anything about a portal
 * block. Before it, the alias handed back the WEBSITE element's schema, which
 * describes different props entirely.
 */
export function portalElementSchema(type: ClientPortalBlockType): ElementSchema {
  const pairing = portalElementPairing(type);
  const cached = PORTAL_SCHEMA_CACHE.get(pairing.type);
  if (cached) return cached;

  // The type's real authoring defaults, straight from the record it inserts —
  // one source, so a schema default can never disagree with what an operator
  // actually gets. `id`/`type` are identity, not props.
  const { id: _id, type: _type, ...defaults } = createPortalBlockRecord(pairing.type, "schema");
  const schema = buildElementSchema({
    type: pairing.type,
    fields: [...PORTAL_PROP_FIELDS],
    defaultProps: defaults as Record<string, unknown>,
    isContainer: false,
    surfaces: ["portal"],
  });
  PORTAL_SCHEMA_CACHE.set(pairing.type, schema);
  return schema;
}

// ─── The two genuinely new elements ───────────────────────────────────────

/**
 * The renderer a portal-only element registers: nothing.
 *
 * This looks wrong and is deliberate. The live approval panel and file drop are
 * `PortalApprovalBlock` / `PortalFileUploadBlock` in
 * `src/app/portal/customer/_PortalInteractionBlocks.tsx` — client components
 * wired to the client's live decisions and files, mounted by the portal host.
 * P3 merges the VOCABULARY, so that there is one list of placeable things and
 * an assistant can plan against it. It does not move the renderers, because
 * moving them is what the parity harness exists to forbid.
 *
 * Returning `null` matches what `BlockRenderer` already does with a type it has
 * no renderer for on a live page, so an element that escapes onto a website
 * surface degrades the same way everything else does rather than throwing in
 * front of a visitor.
 */
function portalHostElement(): null {
  return null;
}

const PORTAL_ONLY_DEFINITIONS: Record<string, BlockDefinition> = {
  "approval-panel": {
    type: "approval-panel",
    label: "Decision panel",
    icon: "✓",
    category: "content",
    isContainer: false,
    surfaces: ["portal"],
    Component: portalHostElement,
    defaultProps: {
      eyebrow: "Decisions",
      title: "Your approvals",
      body: "Review each decision and keep the work moving with a clear response.",
    },
    fields: [
      { key: "eyebrow", label: "Eyebrow", type: "text", maxLength: 100 },
      { key: "title", label: "Title", type: "text", required: true, maxLength: 180 },
      { key: "body", label: "Body", type: "textarea", maxLength: 1_200 },
    ],
  },
  "file-upload": {
    type: "file-upload",
    label: "File drop",
    icon: "↥",
    category: "content",
    isContainer: false,
    surfaces: ["portal"],
    Component: portalHostElement,
    defaultProps: {
      eyebrow: "Project files",
      title: "Share a file",
      body: "Upload the context, inspiration, or recording the team needs.",
      actionLabel: "Upload file",
    },
    fields: [
      { key: "eyebrow", label: "Eyebrow", type: "text", maxLength: 100 },
      { key: "title", label: "Title", type: "text", required: true, maxLength: 180 },
      { key: "body", label: "Body", type: "textarea", maxLength: 1_200 },
      { key: "actionLabel", label: "Button label", type: "text", maxLength: 80 },
    ],
  },
};

// Registered on import, the same way the website library registers itself.
// `clientPortalBuilder` imports this module for the pairing table, so anywhere
// portal code runs the two new definitions are present.
registerElementDefinitions(PORTAL_ONLY_DEFINITIONS);

// ─── Integrity ────────────────────────────────────────────────────────────

export interface PortalVocabularyProblem {
  type: ClientPortalBlockType;
  message: string;
}

/**
 * Every way the merged vocabulary can be broken, as a list.
 *
 * This is the check that a single registry buys and two registries could not.
 * Before P3, deleting the website `banner` definition did nothing visible to
 * the portal — the portal had its own `callout` and simply carried on, and the
 * "these are the same element" claim lived in a comment. Now the claim is a
 * link, and this function is what makes breaking it loud.
 *
 * Called by `scripts/smoke-portal-elements.test.ts` rather than at import time:
 * the aliases resolve only once the website library has registered itself, and
 * a portal page must never crash because a palette entry lost its twin.
 */
export function portalVocabularyProblems(): PortalVocabularyProblem[] {
  const problems: PortalVocabularyProblem[] = [];
  for (const pairing of PORTAL_ELEMENT_PAIRINGS) {
    const target = pairing.alias ?? pairing.type;
    if (pairing.type === "system-content") continue;
    const definition = getElementDefinition(target);
    if (!definition) {
      problems.push({
        type: pairing.type,
        message: pairing.alias
          ? `is an alias of "${pairing.alias}", which is not in the shared registry`
          : `is portal-only but has no registered definition`,
      });
      continue;
    }
    if (!servesSurface(definition, "portal")) {
      problems.push({
        type: pairing.type,
        message: `resolves to "${target}", which does not serve the portal surface`,
      });
    }

    // P5 — and the type's own authoring defaults must satisfy the portal's own
    // generated schema. A default that the schema rejects means an operator
    // inserts a block the same validator would refuse a moment later, which is
    // the drift a generated contract exists to make impossible.
    const record = createPortalBlockRecord(pairing.type, `check-${pairing.type}`);
    const flat = record as unknown as Record<string, unknown>;
    // `binding`/`visibility` are stored FLAT on the record — `toElement` is what
    // moves them into their side channels — so they read the record directly;
    // `responsive`/`media` are stored nested and read their own object. `media`
    // is absent on every type but `image`/`video`, and an absent channel is
    // nothing to check rather than a problem.
    const channels: Array<[string, ElementSchema, Record<string, unknown> | undefined]> = [
      ["default", portalElementSchema(pairing.type), flat],
      ["binding", PORTAL_SIDE_CHANNEL_SCHEMAS.binding, flat],
      ["visibility", PORTAL_SIDE_CHANNEL_SCHEMAS.visibility, flat],
      ["responsive", PORTAL_SIDE_CHANNEL_SCHEMAS.responsive, record.responsive as unknown as Record<string, unknown>],
      ["media", PORTAL_SIDE_CHANNEL_SCHEMAS.media, record.media as unknown as Record<string, unknown> | undefined],
    ];
    for (const [label, channelSchema, values] of channels) {
      if (!values) continue;
      for (const problem of validateElementProps(channelSchema, values)) {
        problems.push({ type: pairing.type, message: `${label} ${problem.key} ${problem.message}` });
      }
    }
  }
  return problems;
}

// ─── Lossless conversion ──────────────────────────────────────────────────
//
// `ClientPortalPageBlock` stays the STORED shape. 98 design documents hold it,
// every version snapshot restores it, and the live renderer reads it. What
// changes is that it can now be viewed as an `Element` without losing anything,
// which is what lets a later phase plan edits over portal pages with the same
// engine the website uses.
//
// Where each stored field goes, and why:
//
//   authored copy      → `props`      (eyebrow/title/body/action/items/media/…)
//   which records      → `binding`    (dataSource/requestType/approvalType/…)
//   who sees it        → `visibility` (visibilityRule + productIds/productMatch)
//
// `productIds`/`productMatch` belong to VISIBILITY, not binding: the only
// reader is `portalBlockMatchesProducts`, which uses them to decide whether the
// signed-in client sees the block at all. Putting them in `binding` would look
// tidier next to the design note and would be wrong.

const PORTAL_PROP_KEYS = [
  "visible", "responsive", "width", "tone",
  "eyebrow", "title", "body", "actionLabel", "actionHref",
  "items", "media", "extension",
] as const;

/** A stored portal block, seen as an element. Lossless: `fromElement` inverts it. */
export function toElement(block: ClientPortalPageBlock): Block {
  const props: Record<string, unknown> = {};
  for (const key of PORTAL_PROP_KEYS) {
    const value = block[key];
    if (value !== undefined) props[key] = value;
  }

  const binding: ElementBinding = {};
  if (block.dataSource !== undefined) binding.source = block.dataSource;
  if (block.requestType !== undefined) binding.requestType = block.requestType;
  if (block.approvalType !== undefined) binding.approvalType = block.approvalType;
  if (block.uploadCategory !== undefined) binding.uploadCategory = block.uploadCategory;

  const visibility: ElementVisibility = {
    rule: block.visibilityRule,
    productIds: block.productIds,
    productMatch: block.productMatch,
  };

  const element: Block = { id: block.id, type: block.type, props, visibility };
  if (Object.keys(binding).length) element.binding = binding;
  return element;
}

/** The inverse. Anything the element does not carry falls back to the type's defaults. */
export function fromElement(element: Block): ClientPortalPageBlock {
  const type = (element.type as ClientPortalBlockType);
  const base = createPortalBlockRecord(type, element.id);
  const props = element.props ?? {};
  const binding = element.binding ?? {};
  const visibility = element.visibility;

  const block: ClientPortalPageBlock = {
    ...base,
    visible: typeof props.visible === "boolean" ? props.visible : base.visible,
    visibilityRule: visibility?.rule ?? base.visibilityRule,
    productIds: visibility?.productIds ?? base.productIds,
    productMatch: (visibility?.productMatch as ClientPortalProductMatch | undefined) ?? base.productMatch,
    responsive: (props.responsive as ClientPortalPageBlock["responsive"]) ?? base.responsive,
    width: (props.width as ClientPortalPageBlock["width"]) ?? base.width,
    tone: (props.tone as ClientPortalPageBlock["tone"]) ?? base.tone,
    eyebrow: typeof props.eyebrow === "string" ? props.eyebrow : base.eyebrow,
    title: typeof props.title === "string" ? props.title : base.title,
    body: typeof props.body === "string" ? props.body : base.body,
    actionLabel: typeof props.actionLabel === "string" ? props.actionLabel : base.actionLabel,
    actionHref: typeof props.actionHref === "string" ? props.actionHref : base.actionHref,
    items: (props.items as ClientPortalPageBlock["items"]) ?? base.items,
  };

  // Optional keys are assigned rather than spread so an absent one stays
  // absent. `{ media: undefined }` and `{}` are the same document once stored
  // but not the same object, and the parity baseline compares objects.
  const dataSource = binding.source ?? base.dataSource;
  if (dataSource !== undefined) block.dataSource = dataSource;
  const requestType = binding.requestType ?? base.requestType;
  if (requestType !== undefined) block.requestType = requestType;
  const approvalType = binding.approvalType ?? base.approvalType;
  if (approvalType !== undefined) block.approvalType = approvalType;
  const uploadCategory = binding.uploadCategory ?? base.uploadCategory;
  if (uploadCategory !== undefined) block.uploadCategory = uploadCategory;
  const media = (props.media as ClientPortalPageBlock["media"]) ?? base.media;
  if (media !== undefined) block.media = media;
  const extension = (props.extension as ClientPortalPageBlock["extension"]) ?? base.extension;
  if (extension !== undefined) block.extension = extension;

  return block;
}

// ─── The stored record ────────────────────────────────────────────────────
//
// This used to be `createPortalBlock` in `clientPortalBuilder.ts`: a base
// literal, an eight-branch if-ladder over it, and two more ladders in
// `blockTitle`/`blockBody` that repeated the same per-type knowledge a third
// time. It is one table read now. `clientPortalBuilder.createPortalBlock`
// remains the public name and calls straight through.
//
// The record shape is unchanged, byte for byte, and
// `scripts/smoke-portal-element-parity.test.ts` is what says so.

const DEFAULT_MEDIA: NonNullable<ClientPortalPageBlock["media"]> = {
  url: "", alt: "", caption: "", aspect: "landscape", fit: "cover",
};

const DEFAULT_EXTENSION: NonNullable<ClientPortalPageBlock["extension"]> = {
  enabled: true,
  placement: "after-content",
  title: "Custom portal component",
  scopedCss: "",
  html: '<section class="portal-component"><h2>Your custom workspace</h2><p id="portal-client"></p></section>',
  css: ".portal-component { padding: 24px; border: 1px solid #d7d1c7; background: #fff; }",
  javascript: 'document.querySelector("#portal-client").textContent = `Prepared for ${window.AQUA_PORTAL.clientName}`;',
  minHeight: 240,
};

export function createPortalBlockRecord(
  type: ClientPortalBlockType,
  id: string,
  makeItemId: () => string = () => "item",
): ClientPortalPageBlock {
  const { defaults } = portalElementPairing(type);
  const block: ClientPortalPageBlock = {
    id,
    type,
    visible: true,
    visibilityRule: "always",
    productIds: [],
    productMatch: "any",
    responsive: { hideOnMobile: false, hideOnDesktop: false, spacing: "comfortable", alignment: "left" },
    width: "full",
    tone: defaults.tone ?? "surface",
    eyebrow: defaults.eyebrow ?? "Private workspace",
    title: defaults.title ?? "",
    body: defaults.body ?? "",
    actionLabel: defaults.actionLabel ?? "",
    actionHref: defaults.actionHref ?? "",
    items: defaults.starterItem
      ? [{ id: makeItemId(), label: "Useful link", detail: "Add a short explanation", href: "https://" }]
      : [],
  };
  if (defaults.dataSource) block.dataSource = defaults.dataSource;
  if (defaults.requestType) block.requestType = defaults.requestType;
  if (defaults.approvalType) block.approvalType = defaults.approvalType;
  if (defaults.uploadCategory) block.uploadCategory = defaults.uploadCategory;
  if (defaults.media) block.media = { ...DEFAULT_MEDIA };
  if (defaults.extension) block.extension = { ...DEFAULT_EXTENSION };
  return block;
}
