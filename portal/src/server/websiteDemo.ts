import "server-only";

import crypto from "node:crypto";

import {
  ensureHydrated,
  flushPendingWrites,
  getState,
  mutate,
  runInDataRealm,
} from "@/server/storage";
import type { WebsiteDemoSignup } from "@/server/types";

/**
 * The public AquaCRM demo — Stage 1: the flag, the consent version, and the
 * store behind the demo gate.
 *
 * ── Why everything here is behind a flag ──────────────────────────────────
 *
 * The demo gate cannot go live until Ed's solicitor supplies real terms and
 * privacy wording, and until the retention period is chosen and its reaper is
 * running (`docs/development/ED-QUESTIONS.md` Q4/Q5). Q5's answer was explicit:
 * "build proceeds behind a flag". So the surfaces exist, are typed, and are
 * tested — and every one of them refuses while the flag is off. Default OFF.
 *
 * ── Why the signups are not in the live realm ─────────────────────────────
 *
 * The demo plan's one hard rule is that NOTHING demo ever lands in the live
 * realm (`docs/development/CLOUD-RESUME.md`). A demo signup is a stranger's
 * name and phone number; it is not a lead in anybody's pipeline, not a client,
 * and not a user. Writing it into the agency's live store would put untriaged
 * strangers into Ed's real inbox and make an erasure request span two systems.
 *
 * So the whole collection lives in the `website-demo` data realm. That is a
 * property this module ENFORCES rather than documents: every read and write
 * below runs inside `runInDataRealm(WEBSITE_DEMO_REALM_ID, …)`.
 *
 * ── Why the consent record says the terms are a placeholder ───────────────
 *
 * The terms and privacy pages ship as clearly-marked drafts. Recording
 * "consented to terms v0" without recording that v0 was a draft would be a
 * false claim about a lawful basis — the kind of claim this codebase does not
 * make. Every record carries `consent.termsArePlaceholder`, and it stays true
 * until the real wording lands.
 *
 * Deliberately NOT here: any retention period, any reaper, and any "we delete
 * your data after X" promise. Ed has not chosen the period, the reaper is not
 * live, and Q4 says not to publish the wording until it is.
 */

/** The data realm demo signups live in. Never `live`. */
export const WEBSITE_DEMO_REALM_ID = "website-demo";

/**
 * The version stamped on every consent record. Bump it when the wording
 * changes — a consent record must name the text the person actually saw.
 */
export const WEBSITE_DEMO_TERMS_VERSION = "demo-terms-placeholder-1";

/**
 * True while the terms/privacy pages carry placeholder wording rather than the
 * solicitor's text. Flip to `false` in the same change that replaces the copy,
 * and bump `WEBSITE_DEMO_TERMS_VERSION` with it.
 */
export const WEBSITE_DEMO_TERMS_ARE_PLACEHOLDER = true;

/**
 * Is the public website demo surface switched on?
 *
 * Server-read only, and OFF unless the environment says otherwise, so a
 * deploy that says nothing keeps the gate shut. Every demo surface — the
 * `/for-agencies` page, the terms and privacy shells, and the signup API —
 * asks this one question.
 */
export function websiteDemoEnabled(): boolean {
  const raw = (process.env.WEBSITE_DEMO_ENABLED ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}

export interface RecordWebsiteDemoSignupInput {
  name: string;
  email?: string;
  phone?: string;
  note?: string;
  sourcePath?: string;
  /** Must be `true`. An unticked box is not consent and is refused. */
  consent: boolean;
  /** Defaults to now. */
  now?: number;
}

export type RecordWebsiteDemoSignupResult =
  | { ok: true; signup: WebsiteDemoSignup }
  | { ok: false; reason: "disabled" | "invalid" | "no-consent" };

function normaliseContact(value: string | undefined, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Contacts compare on a normalised form so casing/spacing cannot hide a record. */
export function websiteDemoContactKey(contact: string): string {
  const trimmed = contact.trim().toLowerCase();
  if (trimmed.includes("@")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  return digits || trimmed;
}

function signupMatchesContact(signup: WebsiteDemoSignup, key: string): boolean {
  if (!key) return false;
  if (signup.email && websiteDemoContactKey(signup.email) === key) return true;
  if (signup.phone && websiteDemoContactKey(signup.phone) === key) return true;
  return false;
}

/**
 * Record one demo request, in the demo realm, with its consent.
 *
 * Returns a discriminated result rather than throwing: the caller is a public
 * route that must not leak an internal error to a stranger.
 */
export async function recordWebsiteDemoSignup(
  input: RecordWebsiteDemoSignupInput,
): Promise<RecordWebsiteDemoSignupResult> {
  if (!websiteDemoEnabled()) return { ok: false, reason: "disabled" };

  const name = normaliseContact(input.name, 120);
  const email = normaliseContact(input.email, 254).toLowerCase();
  const phone = normaliseContact(input.phone, 40);
  if (!name || (!email && !phone)) return { ok: false, reason: "invalid" };
  if (input.consent !== true) return { ok: false, reason: "no-consent" };

  const now = input.now ?? Date.now();
  const signup: WebsiteDemoSignup = {
    id: `demo_${crypto.randomBytes(8).toString("hex")}`,
    name,
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(input.note ? { note: normaliseContact(input.note, 2_000) } : {}),
    ...(input.sourcePath ? { sourcePath: normaliseContact(input.sourcePath, 200) } : {}),
    consent: {
      givenAt: now,
      termsVersion: WEBSITE_DEMO_TERMS_VERSION,
      termsArePlaceholder: WEBSITE_DEMO_TERMS_ARE_PLACEHOLDER,
    },
    createdAt: now,
  };

  await runInDataRealm(WEBSITE_DEMO_REALM_ID, async () => {
    await ensureHydrated();
    mutate(state => {
      state.websiteDemoSignups ??= {};
      state.websiteDemoSignups[signup.id] = signup;
    });
    await flushPendingWrites();
  });

  return { ok: true, signup };
}

/** Every recorded demo signup, newest first. Read from the demo realm only. */
export async function listWebsiteDemoSignups(): Promise<WebsiteDemoSignup[]> {
  return runInDataRealm(WEBSITE_DEMO_REALM_ID, async () => {
    await ensureHydrated();
    return Object.values(getState().websiteDemoSignups ?? {})
      .sort((a, b) => b.createdAt - a.createdAt);
  });
}

/**
 * The demo signups belonging to one email address or phone number.
 *
 * This is the lookup a data-subject request needs: "you hold my details, show
 * me" and "delete them" both start here. Demo signups have no agency, so they
 * would otherwise be invisible to the per-agency governance surface — which is
 * exactly how personal data survives an erasure that claimed to be complete.
 */
export async function findWebsiteDemoSignupsForContact(
  contact: string,
): Promise<WebsiteDemoSignup[]> {
  const key = websiteDemoContactKey(contact ?? "");
  if (!key) return [];
  const all = await listWebsiteDemoSignups();
  return all.filter(signup => signupMatchesContact(signup, key));
}

/**
 * Erase every demo signup for one contact. Returns how many records were
 * actually deleted — the honest number, so a governance surface can report
 * what happened rather than assume it worked.
 */
export async function eraseWebsiteDemoSignupsForContact(
  contact: string,
): Promise<{ erased: number }> {
  const key = websiteDemoContactKey(contact ?? "");
  if (!key) return { erased: 0 };
  return runInDataRealm(WEBSITE_DEMO_REALM_ID, async () => {
    await ensureHydrated();
    let erased = 0;
    mutate(state => {
      const signups = state.websiteDemoSignups ?? {};
      for (const [id, signup] of Object.entries(signups)) {
        if (!signupMatchesContact(signup, key)) continue;
        delete signups[id];
        erased += 1;
      }
    });
    await flushPendingWrites();
    return { erased };
  });
}
