import "server-only";

import { fetchPublicSiteHtml, SafeFetchError } from "@/lib/server/safeSiteFetch";
import type { AquaFormSchema, AquaFormFieldSchema } from "@/server/types";

/**
 * Prove the Aqua Tag is live on a domain, and count what it will capture.
 *
 * This is the first tangible step of the setup wizard: paste the tag on a site,
 * then we fetch that site the way anyone on the internet would and read the HTML
 * back. If our `/aqua-tag.js` script is there — and carrying this agency's own
 * master key — the tag is installed. Then we count the forms, splitting "every
 * form on the page" from "the ones the tag would actually capture", so the
 * headline is honest: an enquiry form counts, a search box or a login does not.
 *
 * The form heuristic mirrors `capturableForm` in the tag itself
 * (`lib/aquaTagSource.ts`), read from static HTML rather than a live DOM, so the
 * count shown here matches what the installed tag will do.
 */

export interface AquaTagScanForms {
  /** Every `<form>` on the page. */
  total: number;
  /** The forms the tag would actually capture (enquiry-shaped, not logins). */
  capturable: number;
}

export interface AquaTagAnalysis {
  /** An `/aqua-tag.js` script is present on the page. */
  tagPresent: boolean;
  /** ...and it carries this agency's master key. */
  keyMatches: boolean;
  /** Whatever site key the installed tag carries, if any. */
  detectedSiteKey?: string;
  forms: AquaTagScanForms;
}

export interface AquaTagDetection extends AquaTagAnalysis {
  /** The address that was checked, normalised. */
  url: string;
  /** The page actually read after redirects (may differ from `url`). */
  finalUrl?: string;
  /** We reached a page and read its HTML. */
  reachable: boolean;
  statusCode?: number;
  /** A plain-English reason we couldn't complete the check, if any. */
  error?: string;
}

const AQUA_TAG_SCRIPT = /<script\b[^>]*\bsrc\s*=\s*(?:"[^"]*aqua-tag\.js[^"]*"|'[^']*aqua-tag\.js[^']*')[^>]*>/gi;

/** Pull the `data-site-key` off whichever aqua-tag script carries one. */
function siteKeyFromScripts(html: string): string | undefined {
  for (const match of html.matchAll(AQUA_TAG_SCRIPT)) {
    const key = /\bdata-site-key\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(match[0]);
    const value = (key?.[1] ?? key?.[2] ?? "").trim();
    if (value) return value;
  }
  return undefined;
}

const EMPTY_FORMS: AquaTagScanForms = { total: 0, capturable: 0 };

/**
 * Count forms the way the tag decides what to capture, from static HTML.
 *
 * A form is capturable when the site explicitly marked it (`data-aqua-form` /
 * `data-aqua-capture`) or it plainly asks for a way to reply (an email/phone
 * field). A password field, or a `data-aqua-ignore`, opts it out — the tag
 * refuses to hoover up logins and payment forms, and so does the count.
 */
export function scanFormsInHtml(html: string): AquaTagScanForms {
  if (!html) return EMPTY_FORMS;
  const forms = html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi);
  let total = 0;
  let capturable = 0;
  for (const match of forms) {
    total += 1;
    const attrs = match[1] ?? "";
    const inner = match[2] ?? "";
    const block = `${attrs} ${inner}`;
    if (/\bdata-aqua-ignore\b/i.test(block)) continue;
    if (/\bdata-aqua-(?:form|capture)\b/i.test(attrs)) { capturable += 1; continue; }
    if (/<input\b[^>]*\btype\s*=\s*(?:"password"|'password')/i.test(inner)) continue;
    const asksForReply =
      /<input\b[^>]*\btype\s*=\s*(?:"(?:email|tel)"|'(?:email|tel)')/i.test(inner) ||
      /<input\b[^>]*\bname\s*=\s*(?:"[^"]*(?:email|phone)[^"]*"|'[^']*(?:email|phone)[^']*')/i.test(inner);
    if (asksForReply) capturable += 1;
  }
  return { total, capturable };
}

/** Read one HTML attribute's value from a tag's attribute string. */
function attrValue(attrs: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(attrs);
  if (!match) return undefined;
  const value = (match[1] ?? match[2] ?? match[3] ?? "").trim();
  return value || undefined;
}

/** "full_name" / "full-name" / "fullName" → "Full name" — a readable fallback label. */
function humanizeName(name: string): string {
  const words = name.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
  if (!words) return name;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const NON_ENTRY_INPUT_TYPES = new Set(["hidden", "submit", "button", "reset", "image"]);

/**
 * Extract each form's field layout from static HTML — the schema behind the
 * "Import forms" step (plan Phase 2). Mirrors `scanFormsInHtml`'s form +
 * capturable heuristic so "these 3 forms" here are the same three it counts, then
 * reads the fields the tag would relay: their name, the visible label (a `for=`
 * label, else aria-label/placeholder, else a humanised name), the input type, and
 * whether they are required. Non-entry inputs (hidden/submit/buttons) are left
 * out, and repeated names (radio/checkbox groups) collapse to one field.
 */
export function scanFormSchemasInHtml(html: string): AquaFormSchema[] {
  if (!html) return [];
  const schemas: AquaFormSchema[] = [];
  for (const match of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const attrs = match[1] ?? "";
    const inner = match[2] ?? "";
    const block = `${attrs} ${inner}`;

    const ignored = /\bdata-aqua-ignore\b/i.test(block);
    const marked = /\bdata-aqua-(?:form|capture)\b/i.test(attrs);
    const hasPassword = /<input\b[^>]*\btype\s*=\s*(?:"password"|'password')/i.test(inner);
    const asksForReply =
      /<input\b[^>]*\btype\s*=\s*(?:"(?:email|tel)"|'(?:email|tel)')/i.test(inner) ||
      /<input\b[^>]*\bname\s*=\s*(?:"[^"]*(?:email|phone)[^"]*"|'[^']*(?:email|phone)[^']*')/i.test(inner);
    const capturable = !ignored && (marked || (!hasPassword && asksForReply));

    // Labels declared with `for=`, mapped to the input id they point at.
    const labelFor = new Map<string, string>();
    for (const label of inner.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi)) {
      const forId = attrValue(label[1] ?? "", "for");
      const text = (label[2] ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      if (forId && text) labelFor.set(forId, text);
    }

    const fields: AquaFormFieldSchema[] = [];
    const seen = new Set<string>();
    for (const field of inner.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
      const tag = (field[1] ?? "").toLowerCase();
      const fa = field[2] ?? "";
      const type = tag === "input" ? (attrValue(fa, "type") ?? "text").toLowerCase() : tag;
      if (tag === "input" && NON_ENTRY_INPUT_TYPES.has(type)) continue;
      const name = attrValue(fa, "name") ?? attrValue(fa, "id");
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      const id = attrValue(fa, "id");
      const label =
        (id ? labelFor.get(id) : undefined) ??
        attrValue(fa, "aria-label") ??
        attrValue(fa, "placeholder") ??
        humanizeName(name);
      fields.push({ name, label, type, required: /\brequired\b/i.test(fa) });
    }

    const submitInput = /<input\b[^>]*\btype\s*=\s*(?:"submit"|'submit')[^>]*>/i.exec(inner)?.[0];
    const submitButton = /<button\b[^>]*>([\s\S]*?)<\/button>/i.exec(inner)?.[1];
    const submitLabel =
      (submitInput ? attrValue(submitInput, "value") : undefined) ??
      (submitButton ? submitButton.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || undefined : undefined);
    const formId = attrValue(attrs, "id") ?? attrValue(attrs, "name");

    schemas.push({
      formId,
      label: formId ?? submitLabel ?? "Website form",
      action: attrValue(attrs, "action"),
      capturable,
      fields,
    });
  }
  return schemas;
}

/** Read a page's HTML for the tag and its forms. Pure — no network. */
export function analyzeAquaTagHtml(html: string, masterSiteKey: string): AquaTagAnalysis {
  const detectedSiteKey = siteKeyFromScripts(html);
  const tagPresent = AQUA_TAG_SCRIPT.test(html);
  AQUA_TAG_SCRIPT.lastIndex = 0; // the regex is global; reset after a .test()
  return {
    tagPresent,
    keyMatches: tagPresent && Boolean(detectedSiteKey) && detectedSiteKey === masterSiteKey,
    detectedSiteKey,
    forms: scanFormsInHtml(html),
  };
}

/**
 * Fetch a domain and report whether the master tag is live and how many forms
 * it would capture. Network failures come back as a reachable:false result with
 * a plain reason, not a throw — an unreachable site is a normal thing to show,
 * not an error to swallow.
 */
export async function detectAquaTag(input: { rawUrl: string; masterSiteKey: string }): Promise<AquaTagDetection> {
  let page;
  try {
    page = await fetchPublicSiteHtml(input.rawUrl);
  } catch (error) {
    if (error instanceof SafeFetchError) {
      return { url: input.rawUrl.trim(), reachable: false, error: error.message, tagPresent: false, keyMatches: false, forms: EMPTY_FORMS };
    }
    throw error;
  }

  const analysis = analyzeAquaTagHtml(page.html, input.masterSiteKey);
  const ok = page.statusCode >= 200 && page.statusCode < 400;
  return {
    ...analysis,
    url: input.rawUrl.trim(),
    finalUrl: page.finalUrl,
    reachable: ok,
    statusCode: page.statusCode,
    error: ok ? undefined : `The site answered with HTTP ${page.statusCode}.`,
  };
}
