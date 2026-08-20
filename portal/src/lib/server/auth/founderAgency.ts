import "server-only";

import { getState } from "@/server/storage";

// Whose instance is this, really?
//
// AquaCRM runs as ONE app serving MANY companies, and Ed's own company is just
// one of them. But a pile of code still assumes the whole deployment is his: it
// reads `process.env` for a credential and hands the answer to whichever agency
// asked. That is fine for his agency and wrong for every other one — a second
// company's Stripe checkout would run on his key, and its mail would leave as
// his from-address with his reply-to.
//
// So env values are HIS values, and this is the line that says so. Anything
// falling back to the environment must first ask whether the agency in question
// is the one the environment belongs to.
//
// Deliberately kept tiny and dependency-light: it reads state directly rather
// than importing the user/tenant modules, because the callers that need it
// (integration credentials, transactional email) sit underneath those.

const DEFAULT_FOUNDER_EMAIL = "edwardhallam07@gmail.com";

/** The founder account's email, from the environment or the built-in default. */
export function founderEmail(): string {
  const configured = process.env.FOUNDER_EMAIL;
  return (configured && configured.trim() ? configured : DEFAULT_FOUNDER_EMAIL).trim().toLowerCase();
}

/**
 * The agency the environment's credentials belong to — the founder's own.
 *
 * `undefined` when the founder account has not been seeded yet, which is the
 * honest answer: callers must then treat NO agency as entitled to env values
 * rather than guessing at one.
 */
export function founderAgencyId(): string | undefined {
  const state = getState();
  const email = founderEmail();
  // `users` is keyed by lower-cased email, but fall back to a scan so a legacy
  // record with different casing is still found rather than silently missed.
  const direct = state.users[email];
  if (direct?.agencyId) return direct.agencyId;
  const found = Object.values(state.users)
    .find(user => (user.email ?? "").trim().toLowerCase() === email);
  return found?.agencyId;
}

/**
 * May this agency use the credentials sitting in `process.env`?
 *
 * Only the founder's own. Everyone else must connect their own — and the
 * "not configured" branch their caller already has is what prompts them to.
 */
export function mayUseEnvironmentCredentials(agencyId: string | undefined): boolean {
  if (!agencyId) return false;
  const founder = founderAgencyId();
  return Boolean(founder && founder === agencyId);
}
