import "server-only";

import type { EditAdapter, EditDocument, EditIntent, EditPlan, EditTarget } from "@/engines/editor/editing/engine";
import type { PropField, PropFieldType } from "@/engines/editor/elements/definition";
import { logActivity } from "@/server/activity";
import { getAgencyWorkspaceSettings, updateAgencyWorkspaceSettings } from "@/server/agencySettings";
import { getAgency, updateAgency } from "@/server/tenants";
import type { AgencyWorkspaceSettings, BrandKit } from "@/server/types";
import { fingerprint } from "./adapters";

/**
 * The app's own configuration, on the shared editing loop.
 *
 * Aqua can already edit the things it *publishes* — client portals, the agency
 * website, portal forms. It could not edit itself: changing the workspace's own
 * colours, fonts or identity meant a Settings form that wrote on first submit,
 * with no preview of what would move and no protection against two people
 * saving over each other. This is that same surface behind
 * `map → plan → publish`, so the Dev Team editor gets the dry run, the
 * before/after diff, the conflict check and the explicit-confirm rule for free.
 *
 * Two stores sit behind one document because they are one thing to the person
 * editing: `Agency.brand` (how the app looks) and `AgencyWorkspaceSettings`
 * (what the app calls itself). The revision is both stores' `updatedAt`
 * together, and each field carries its own fingerprint — so editing the logo
 * while somebody else edits the support email is not a conflict, and two people
 * editing the *same* field is.
 *
 * Scope note: an adapter is built for exactly one `agencyId`, handed in by the
 * caller from the session. Nothing here reads a tenant id from a request.
 *
 * Deliberately NOT editable here:
 *  - `brand.customCSS` — raw CSS injected at the page root. A text box that can
 *    restyle every tenant page is not a "clearly safe" config field.
 *  - numeric and toggle settings (tax rate, payment terms, notification
 *    switches) — they have real business consequences and their own Settings
 *    screens; this editor is for the app's appearance and identity.
 */

// ─── Which fields are editable ────────────────────────────────────────────

type BrandFieldKey =
  | "logoUrl" | "primaryColor" | "secondaryColor" | "accentColor"
  | "fontHeading" | "fontBody" | "borderRadius";

type WorkspaceFieldKey =
  | "legalName" | "website" | "supportEmail" | "phone"
  | "timezone" | "defaultCurrency" | "invoicePrefix" | "clientWelcomeMessage";

/**
 * How the editor should render a field. Presentation only — never a guard.
 *
 * A subset of `PropFieldType`, not a parallel enum: this catalogue and the
 * element properties panel now speak the one prop-schema vocabulary (element
 * engine, P2). `Extract` is what keeps them from drifting — deleting "url"
 * from `PropFieldType` would fail to compile here rather than leave a control
 * name nothing renders.
 */
export type AppConfigControl = Extract<PropFieldType, "color" | "text" | "url" | "textarea">;

export type AppConfigGroup = "Brand" | "Identity" | "Workspace defaults" | "Client experience";

export const APP_CONFIG_GROUPS: AppConfigGroup[] = ["Brand", "Identity", "Workspace defaults", "Client experience"];

/**
 * An app-config field IS a `PropField`, narrowed.
 *
 * There used to be two prop-schema vocabularies in the codebase sharing no
 * code: `PropField` (9 controls, a form-widget descriptor for the element
 * properties panel) and this shape (4 controls, plus the validation the
 * element side had no way to express). P2 collapsed them — the validation-grade
 * members (`required`, `normalise`, `validate`, `min`, `pattern`, …) moved onto
 * `PropField` itself, so this is that type with three members made mandatory
 * and one narrowed:
 *
 *   • `type`     narrowed to the four controls this editor draws
 *   • `help`     required — every setting here explains itself
 *   • `group`    required, and one of the four sections the page renders
 *   • `validate` required — see the validator note below; an unvalidated brand
 *                value goes straight into a `<style>` tag
 *
 * The wire shape the page reads (`AppConfigFieldView`) is unchanged: it still
 * says `id` / `control` / `hint` / `optional`, mapped from `key` / `type` /
 * `help` / `required` at the boundary. That was deliberate — the client
 * component and its route are not part of this change.
 */
type FieldShape = PropField & {
  type: AppConfigControl;
  help: string;
  group: AppConfigGroup;
  /** `null` when acceptable, otherwise the message the operator reads. */
  validate: (value: string) => string | null;
};

type AppConfigField =
  | (FieldShape & { source: "brand"; storageKey: BrandFieldKey })
  | (FieldShape & { source: "workspace"; storageKey: WorkspaceFieldKey });

// ─── Validators ───────────────────────────────────────────────────────────
//
// Brand values are emitted verbatim into a `<style>` tag by `brandToStyleString`
// / `ThemeInjector`, and neither `updateAgency` nor `BrandKit` validates
// anything. So these are the only thing standing between a typo and a broken
// stylesheet — and between a paste and injected CSS. They are strict on
// purpose: a rejected value is a message, an accepted bad one is a broken app.

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const CSS_LENGTH = /^(?:0|\d{1,3}(?:\.\d{1,2})?(?:px|rem|em|%))$/;
// A font stack: names, quotes, commas. No `;`, `{`, `}`, `(`, `)`, `<`, `>` or
// backslash, so nothing can close the declaration or the style block.
const FONT_STACK = /^[A-Za-z0-9 ,._'"-]{1,160}$/;
const ASSET_PATH = /^(?:https?:\/\/[^\s"'()<>\\]{3,480}|\/[^\s"'()<>\\]{0,480})$/;
// Mirrors `cleanEmail` in agencySettings so an accepted value is never dropped.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[0-9+()\s-]{4,40}$/;
const CURRENCY = /^[A-Za-z]{3}$/;
const INVOICE_PREFIX = /^[A-Za-z0-9]{1,12}$/;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function hexColour(value: string): string | null {
  return HEX.test(value) ? null : "Use a hex colour like #0B6F6D or #0BF.";
}

function fontStack(value: string): string | null {
  if (!FONT_STACK.test(value)) return "Font names, commas and quotes only — no brackets, semicolons or braces.";
  const doubles = (value.match(/"/g) ?? []).length;
  const singles = (value.match(/'/g) ?? []).length;
  if (doubles % 2 !== 0 || singles % 2 !== 0) return "Unclosed quote — quoted font names need a matching quote.";
  return null;
}

function plainText(limit: number, allowNewlines = false) {
  return (value: string): string | null => {
    if (value.length > limit) return `Too long — ${limit} characters maximum.`;
    const body = allowNewlines ? value.replace(/[\r\n]/g, " ") : value;
    if (CONTROL_CHARS.test(body)) return "Remove the control characters.";
    if (!allowNewlines && /[\r\n]/.test(value)) return "Keep this on one line.";
    if (/[<>]/.test(value)) return "Angle brackets are not allowed here.";
    return null;
  };
}

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** `cleanUrl` in agencySettings stores `new URL(...).toString()`, so match it. */
function normaliseUrl(value: string): string {
  try {
    return new URL(value.trim()).toString();
  } catch {
    return value.trim();
  }
}

// ─── The field catalogue ──────────────────────────────────────────────────

const FIELDS: AppConfigField[] = [
  {
    key: "brand.primaryColor", source: "brand", storageKey: "primaryColor",
    label: "Primary colour", group: "Brand", type: "color", required: true,
    help: "The main brand colour. Drives --brand-primary across every portal page.",
    placeholder: "#0B6F6D", validate: hexColour,
  },
  {
    key: "brand.secondaryColor", source: "brand", storageKey: "secondaryColor",
    label: "Secondary colour", group: "Brand", type: "color",
    help: "Supporting colour. Leave empty to fall back to the bundled theme.",
    placeholder: "#1F2937", validate: hexColour,
  },
  {
    key: "brand.accentColor", source: "brand", storageKey: "accentColor",
    label: "Accent colour", group: "Brand", type: "color",
    help: "Highlights and calls to action.",
    placeholder: "#F97316", validate: hexColour,
  },
  {
    key: "brand.fontHeading", source: "brand", storageKey: "fontHeading",
    label: "Heading font", group: "Brand", type: "text",
    help: "A CSS font-family stack for headings.",
    placeholder: "ui-sans-serif, system-ui", validate: fontStack,
  },
  {
    key: "brand.fontBody", source: "brand", storageKey: "fontBody",
    label: "Body font", group: "Brand", type: "text",
    help: "A CSS font-family stack for body copy.",
    placeholder: "ui-sans-serif, system-ui", validate: fontStack,
  },
  {
    key: "brand.borderRadius", source: "brand", storageKey: "borderRadius",
    label: "Corner radius", group: "Brand", type: "text",
    help: "A single CSS length — how rounded cards and buttons are.",
    placeholder: "12px",
    validate: value => (CSS_LENGTH.test(value) ? null : "Use a CSS length like 12px, 0.75rem or 0."),
  },
  {
    key: "brand.logoUrl", source: "brand", storageKey: "logoUrl",
    label: "Logo URL", group: "Brand", type: "url",
    help: "An https:// address or a path starting with /.",
    placeholder: "/logo.svg",
    validate: value => (ASSET_PATH.test(value) ? null : "Use an https:// address or a path starting with / — no spaces or quotes."),
  },

  {
    key: "workspace.legalName", source: "workspace", storageKey: "legalName",
    label: "Legal name", group: "Identity", type: "text",
    help: "The registered company name used on documents.",
    placeholder: "Milesy Media Ltd", validate: plainText(180),
  },
  {
    key: "workspace.website", source: "workspace", storageKey: "website",
    label: "Website", group: "Identity", type: "url",
    help: "Your public site. Stored normalised, so a trailing slash may appear.",
    placeholder: "https://example.com", normalise: normaliseUrl,
    validate: value => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:" ? null : "Use an http:// or https:// address.";
      } catch {
        return "That is not a valid web address.";
      }
    },
  },
  {
    key: "workspace.supportEmail", source: "workspace", storageKey: "supportEmail",
    label: "Support email", group: "Identity", type: "text",
    help: "Where clients are told to write. Stored lower-case.",
    placeholder: "hello@example.com", normalise: value => value.trim().toLowerCase(),
    validate: value => (EMAIL.test(value) ? null : "That is not a valid email address."),
  },
  {
    key: "workspace.phone", source: "workspace", storageKey: "phone",
    label: "Phone", group: "Identity", type: "text",
    help: "Contact number shown on client-facing surfaces.",
    placeholder: "+44 7700 900000",
    validate: value => (PHONE.test(value) ? null : "Digits, spaces, +, - and brackets only."),
  },

  {
    key: "workspace.timezone", source: "workspace", storageKey: "timezone",
    label: "Timezone", group: "Workspace defaults", type: "text", required: true,
    help: "An IANA zone. Every date in the workspace is read in this zone.",
    placeholder: "Europe/London",
    validate: value => (isValidTimezone(value) ? null : "Not a timezone this system knows — try Europe/London."),
  },
  {
    key: "workspace.defaultCurrency", source: "workspace", storageKey: "defaultCurrency",
    label: "Default currency", group: "Workspace defaults", type: "text", required: true,
    help: "Three-letter ISO code used for new quotes and invoices.",
    placeholder: "GBP", normalise: value => value.trim().toUpperCase(),
    validate: value => (CURRENCY.test(value) ? null : "Use a three-letter code like GBP, USD or EUR."),
  },
  {
    key: "workspace.invoicePrefix", source: "workspace", storageKey: "invoicePrefix",
    label: "Invoice prefix", group: "Workspace defaults", type: "text", required: true,
    help: "Prefixes every invoice number. Stored upper-case.",
    placeholder: "MM", normalise: value => value.trim().toUpperCase(),
    validate: value => (INVOICE_PREFIX.test(value) ? null : "Letters and digits only, up to 12 characters."),
  },

  {
    key: "workspace.clientWelcomeMessage", source: "workspace", storageKey: "clientWelcomeMessage",
    label: "Client welcome message", group: "Client experience", type: "textarea",
    help: "The first thing a new client reads when their portal opens.",
    placeholder: "Welcome aboard — here is where your project lives.",
    validate: plainText(2_000, true),
  },
];

const FIELD_BY_ID = new Map(FIELDS.map(field => [field.key, field]));

// ─── Reading current values ───────────────────────────────────────────────

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function currentValues(agencyId: string): { values: Record<string, string>; revision: string; agencyName: string } {
  const agency = getAgency(agencyId);
  const settings = getAgencyWorkspaceSettings(agencyId);
  const brand = (agency?.brand ?? {}) as Partial<BrandKit>;
  const values: Record<string, string> = {};
  for (const field of FIELDS) {
    values[field.key] = field.source === "brand"
      ? stringValue(brand[field.storageKey])
      : stringValue((settings as unknown as Record<string, unknown>)[field.storageKey]);
  }
  // Both stores, because either can move underneath an open editor. Per-field
  // fingerprints below decide whether that actually collides with this edit.
  return {
    values,
    revision: `${agency?.updatedAt ?? 0}:${settings.updatedAt}`,
    agencyName: agency?.name ?? agencyId,
  };
}

/** What the page renders: field metadata joined to the value it currently holds. */
export interface AppConfigFieldView {
  id: string;
  label: string;
  group: AppConfigGroup;
  hint: string;
  control: AppConfigControl;
  placeholder?: string;
  optional: boolean;
  value: string;
  /** Sent back with the edit, so a change made underneath is refused. */
  fingerprint: string;
}

/**
 * Joins a mapped document to the static field metadata.
 *
 * Split out because the metadata carries validator *functions*, which cannot
 * cross to a client component — this returns the serialisable half.
 */
export function appConfigFieldViews(document: EditDocument): AppConfigFieldView[] {
  return document.targets.flatMap(target => {
    const field = FIELD_BY_ID.get(target.id);
    if (!field) return [];
    // The one place the shared `PropField` names are translated to the wire
    // names the page has always read. Keeping the translation here is what let
    // the collapse happen without touching the route or the client component.
    return [{
      id: field.key,
      label: field.label,
      group: field.group,
      hint: field.help,
      control: field.type,
      placeholder: field.placeholder,
      optional: field.required !== true,
      value: target.value ?? "",
      fingerprint: target.fingerprint,
    }];
  });
}

// ─── Preparing intents ────────────────────────────────────────────────────

export interface AppConfigInvalidValue {
  targetId: string;
  label: string;
  message: string;
}

/** An edit that normalised back to the value already stored. Dropped, not refused. */
export interface AppConfigSkippedValue {
  targetId: string;
  label: string;
}

/**
 * Normalise then check every value, before the engine sees any of it.
 *
 * Two jobs, and the order matters. Normalising first means the plan's `after`
 * is the value that will really be stored, so the operator confirms the diff
 * they were shown rather than one the storage cleaners quietly rewrite. Then
 * validating means a value that would be *silently dropped* by those cleaners —
 * `cleanEmail` and `cleanUrl` both return `undefined` for anything they dislike
 * — is refused out loud instead of reported as a successful save that changed
 * nothing.
 *
 * A third job when `current` is supplied: DROP an edit that normalises straight
 * back to the stored value. The browser marks a field dirty on the raw string,
 * but trim / lower-case / upper-case / `new URL().toString()` all happen here —
 * so a trailing space in a colour, or retyping a support email with different
 * capitals, reached the engine as a real intent, became a `no-change` REJECTION,
 * and the engine's (correct, deliberate) all-or-nothing rule then killed every
 * other valid edit in the batch. The operator was left hunting for whitespace
 * they cannot see. Dropping the intent here keeps all-or-nothing intact for
 * genuine conflicts and makes "I typed a space" a silent skip.
 *
 * The skip is only taken when the fingerprint still matches: if the field moved
 * underneath the operator, that is a conflict and the engine must still say so.
 */
export function prepareAppConfigIntents(
  raw: Array<{ targetId: string; expectedFingerprint: string; value: string }>,
  current?: EditDocument,
): { intents: EditIntent[]; invalid: AppConfigInvalidValue[]; skipped: AppConfigSkippedValue[] } {
  const intents: EditIntent[] = [];
  const invalid: AppConfigInvalidValue[] = [];
  const skipped: AppConfigSkippedValue[] = [];
  const targetById = new Map((current?.targets ?? []).map(target => [target.id, target]));

  for (const entry of raw) {
    const field = FIELD_BY_ID.get(entry.targetId);
    if (!field) {
      invalid.push({ targetId: entry.targetId, label: entry.targetId, message: "That is not an editable setting." });
      continue;
    }
    const value = (field.normalise ? field.normalise(entry.value) : entry.value.trim());
    if (value === "") {
      if (field.required === true) {
        invalid.push({ targetId: field.key, label: field.label, message: "This one cannot be empty." });
        continue;
      }
    } else {
      const problem = field.validate(value);
      if (problem) {
        invalid.push({ targetId: field.key, label: field.label, message: problem });
        continue;
      }
    }
    const target = targetById.get(field.key);
    if (target && target.fingerprint === entry.expectedFingerprint && (target.value ?? "") === value) {
      skipped.push({ targetId: field.key, label: field.label });
      continue;
    }
    intents.push({ targetId: field.key, expectedFingerprint: entry.expectedFingerprint, value });
  }

  return { intents, invalid, skipped };
}

// ─── The adapter ──────────────────────────────────────────────────────────

export function appConfigEditAdapter(input: {
  /** Always the session's agency. Never a value taken from a request body. */
  agencyId: string;
  actorUserId: string;
}): EditAdapter {
  const { agencyId, actorUserId } = input;

  return {
    async map(): Promise<EditDocument> {
      const { values, revision, agencyName } = currentValues(agencyId);
      const targets: EditTarget[] = FIELDS.map(field => ({
        id: field.key,
        label: field.label,
        kind: "direct",
        value: values[field.key],
        // Per field, not per document: two people editing different settings of
        // the same workspace is ordinary and must not collide.
        fingerprint: fingerprint(values[field.key]),
      }));
      return {
        id: `app-config:${agencyId}`,
        label: `${agencyName} app configuration`,
        revision,
        targets,
      };
    },

    async currentRevision(): Promise<string> {
      return currentValues(agencyId).revision;
    },

    async publish(plan: EditPlan) {
      const brandPatch: Partial<BrandKit> = {};
      const settingsPatch: Partial<Pick<AgencyWorkspaceSettings, WorkspaceFieldKey>> = {};

      for (const change of plan.changes) {
        const field = FIELD_BY_ID.get(change.target.id);
        if (!field) continue;
        // Empty means "clear it" — but the two stores disagree about how to say
        // that, and getting this wrong is silent.
        //
        //  • brand: `updateAgency` spreads the patch over the existing kit
        //    (`{ ...existing.brand, ...patch.brand }`), so a key present with
        //    `undefined` really does unset it. An empty string would persist as
        //    a real, blank value.
        //  • workspace: `updateAgencyWorkspaceSettings` merges with
        //    `patch.X ?? current.X`, where `undefined` means "leave it alone".
        //    Sending `undefined` there is a NO-OP, which is how clearing a
        //    legal name / support email / phone / website / welcome message
        //    reported "Applied" and changed nothing. The empty string is what
        //    clears it: `cleanOptional("")` returns `undefined`, so the field
        //    is unset rather than stored blank.
        if (field.source === "brand") brandPatch[field.storageKey] = change.after === "" ? undefined : change.after;
        else settingsPatch[field.storageKey] = change.after;
      }

      // One write per store rather than one per field: a half-applied brand is
      // a workspace nobody chose, visible to whoever loads a page next.
      if (Object.keys(brandPatch).length > 0) updateAgency(agencyId, { brand: brandPatch });
      if (Object.keys(settingsPatch).length > 0) updateAgencyWorkspaceSettings(agencyId, settingsPatch, actorUserId);

      // Read back and check. The storage cleaners clamp and drop values without
      // saying so, and a save that reports success while storing something else
      // is the failure this whole loop exists to prevent.
      const after = currentValues(agencyId);
      const drifted = plan.changes.filter(change => after.values[change.target.id] !== change.after);

      logActivity({
        agencyId,
        actorUserId,
        category: "settings",
        action: "dev.app_config_updated",
        message: `Updated ${plan.changes.length} app setting${plan.changes.length === 1 ? "" : "s"} from the Dev Team editor.`,
        metadata: { fields: plan.changes.map(change => change.target.id) },
      });

      const applied = `Updated ${plan.changes.length} setting${plan.changes.length === 1 ? "" : "s"} for ${after.agencyName}.`;
      return {
        revision: after.revision,
        summary: drifted.length === 0
          ? applied
          : `${applied} ${drifted.length} value${drifted.length === 1 ? " was" : "s were"} adjusted on save (${drifted.map(change => change.target.label).join(", ")}) — check the current values.`,
      };
    },
  };
}
