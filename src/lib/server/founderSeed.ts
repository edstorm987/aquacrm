import "server-only";
// Founder seed (T1 R024 — chapter `04-founder-password-rotation.md`).
//
// Earlier (chapter #122 unify-3) this module hardcoded a 3-char dev
// password and bypassed `validatePassword` via a direct `mutate`. R024 ships
// the ship-gate fix: founder credentials live in env, the seed honours
// `validatePassword`, and production refuses to start with weak or
// default values.
//
// Behaviour:
//
//   - `FOUNDER_EMAIL` — defaults to `edwardhallam07@gmail.com` for
//     dev convenience. Required to differ from default in production.
//   - `FOUNDER_PASSWORD` — no default. Missing → log a warning + skip
//     the seed (rather than create an unauthenticated founder).
//   - `FOUNDER_AGENCY_NAME` — defaults to "Milesy Media".
//   - Production guard: when `NODE_ENV === "production"`, refuse to
//     seed when password length < 12 OR email is the dev default.
//     Throws — fail-closed startup error rather than silent insecure
//     seed.

import { ensureHydrated } from "@/server/storage";
import { bootstrapAgency } from "@/server/agencyBootstrap";
import { getAgencyBySlug } from "@/server/tenants";
import { createUser, getUser } from "@/server/users";

export const FOUNDER_AGENCY_SLUG = "milesymedia";
export const DEFAULT_FOUNDER_EMAIL = "edwardhallam07@gmail.com";
export const DEFAULT_FOUNDER_AGENCY_NAME = "Milesy Media";
export const FOUNDER_NAME = "Ed Hallam";

export const FOUNDER_EMAIL = (process.env.FOUNDER_EMAIL ?? DEFAULT_FOUNDER_EMAIL).trim();

function readFounderAgencyName(): string {
  const v = process.env.FOUNDER_AGENCY_NAME;
  return v && v.trim() ? v.trim() : DEFAULT_FOUNDER_AGENCY_NAME;
}

interface PolicyCheck {
  ok: boolean;
  reason?: string;
}

// Exported for the smoke. Pure — takes explicit inputs so the test
// can drive every branch without process.env mutation.
export function checkFounderPolicy(input: {
  email: string;
  password: string | undefined;
  nodeEnv: string | undefined;
}): PolicyCheck {
  if (!input.password) {
    return { ok: false, reason: "FOUNDER_PASSWORD not set — skipping founder seed." };
  }
  if (input.nodeEnv === "production") {
    if (input.password.length < 12) {
      return { ok: false, reason: "FOUNDER_PASSWORD must be ≥12 chars in production." };
    }
    if (input.email.trim().toLowerCase() === DEFAULT_FOUNDER_EMAIL) {
      return { ok: false, reason: "FOUNDER_EMAIL is the dev default — set a real address before deploying." };
    }
  }
  return { ok: true };
}

let seedPromise: Promise<void> | null = null;

export function seedFounder(): Promise<void> {
  if (!seedPromise) seedPromise = run();
  return seedPromise;
}

// Dev-bypass-only seed for /dev/pov "Founder Ed" persona. The
// regular `seedFounder()` skips when `FOUNDER_PASSWORD` env is unset
// (R024 fail-closed policy), but the dev-bypass surface exists to
// let Ed sign in without setting env. So this helper creates the
// founder user with a hardcoded dev password — file-backed storage
// IS the dev DB. **Production guard**: hard-throws when
// `NODE_ENV === "production"` to prevent accidental use; the regular
// seedFounder is the prod path. Idempotent on email lookup.
const DEV_FOUNDER_PASSWORD = "dev-founder-2026";

// T1 perf-2 — short-window memoize for the dev-bypass seed. Earlier
// the function ran in full on every /dev/pov click so new plugins
// would auto-install when the dev server stayed up for hours; the
// install loop walks every plugin and is the dominant cost on
// repeat clicks (commander flagged the perf hit). Compromise: cache
// the in-flight + completed result for DEV_SEED_TTL_MS so rapid
// repeat clicks short-circuit, but a full re-walk happens after the
// window expires (newly added plugins still get picked up within
// half a minute). Reset helper (`_resetFounderSeedForTests`) clears
// this too so smokes stay deterministic.
const DEV_SEED_TTL_MS = 30_000;
let devSeedPromise: Promise<void> | null = null;
let devSeedAt = 0;

export function seedFounderForDevBypass(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[founderSeed] seedFounderForDevBypass is dev-only — use FOUNDER_PASSWORD env in production.",
    );
  }
  const now = Date.now();
  if (devSeedPromise && now - devSeedAt < DEV_SEED_TTL_MS) {
    return devSeedPromise;
  }
  devSeedAt = now;
  devSeedPromise = devRun().catch((e) => {
    // Failed runs shouldn't poison the cache for the full TTL — clear
    // immediately so the next click retries.
    devSeedPromise = null;
    devSeedAt = 0;
    throw e;
  });
  return devSeedPromise;
}

async function devRun(): Promise<void> {
  await ensureHydrated();

  // Build the founder + Milesy agency if missing.
  const agencyName = readFounderAgencyName();
  let agency = getAgencyBySlug(FOUNDER_AGENCY_SLUG);
  if (!agency) {
    const result = await bootstrapAgency({
      name: agencyName,
      slug: FOUNDER_AGENCY_SLUG,
      ownerEmail: FOUNDER_EMAIL,
    });
    agency = result.agency;
  } else {
    // Agency was created before chapter #156 (or before fulfillment
    // was core) — re-run core-plugin install + pipeline seed
    // idempotently so phases exist for client creation, etc.
    try {
      const { installCorePluginsForScope } = await import("@/plugins/_runtime");
      await installCorePluginsForScope({ agencyId: agency.id }, "dev-bypass-rebootstrap");
      const { seedDefaultPipelines, migrateClientsToFulfilment } = await import("@/server/pipelines");
      seedDefaultPipelines(agency.id);
      migrateClientsToFulfilment(agency.id);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[founderSeed-dev] core-plugin re-install skipped:", e instanceof Error ? e.message : e);
    }
  }

  // Dev-bypass convenience: also install every NON-core plugin that
  // can run agency-scope, so the master Milesy sidebar (Finance / HR /
  // SOPs / Inbox / Email / Ops / Domains / Affiliates / Marketing /
  // Forms / Tasks / etc.) doesn't 404 when Ed clicks around. Idempotent
  // — `installPlugin` short-circuits when already installed. Production
  // path is unchanged: real agencies install plugins via the
  // marketplace.
  try {
    const { installPlugin, getInstall } = await import("@/plugins/_runtime");
    const { listInstallablePlugins } = await import("@/plugins/_registry");
    for (const plugin of listInstallablePlugins()) {
      const policy = plugin.scopePolicy ?? "either";
      if (policy === "client") continue; // client-scope only — needs a clientId
      if (getInstall({ agencyId: agency.id }, plugin.id)) continue;
      await installPlugin(plugin.id, {
        scope: { agencyId: agency.id },
        installedBy: "dev-bypass-rebootstrap",
      });
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[founderSeed-dev] non-core plugin auto-install skipped:", e instanceof Error ? e.message : e);
  }

  let founder = getUser(FOUNDER_EMAIL);
  if (!founder) {
    founder = createUser({
      email: FOUNDER_EMAIL,
      password: DEV_FOUNDER_PASSWORD,
      role: "agency-owner",
      agencyId: agency.id,
      name: FOUNDER_NAME,
    });
  }

  // Same as the env-driven seed: also stand up AquaOasis Demo + make
  // the founder a master. Without this the Topbar agency switcher
  // hides (only 1 agency = no switcher). Idempotent — second run
  // short-circuits on the slug check.
  try {
    const { seedAquaOasisDemo, addUserAgencyMembership } = await import("./aquaOasisSeed");
    const { agency: aquaAgency } = await seedAquaOasisDemo(founder.id);
    addUserAgencyMembership(founder.id, aquaAgency.id);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      "[founderSeed-dev] AquaOasis Demo seed failed — switcher will show only Milesy Media:",
      e instanceof Error ? e.message : e,
    );
  }
}

async function run(): Promise<void> {
  await ensureHydrated();

  if (getUser(FOUNDER_EMAIL)) return;

  const password = process.env.FOUNDER_PASSWORD;
  const policy = checkFounderPolicy({
    email: FOUNDER_EMAIL,
    password,
    nodeEnv: process.env.NODE_ENV,
  });
  if (!policy.ok) {
    if (process.env.NODE_ENV === "production") {
      // Fail-closed in production — never silent-skip when the operator
      // intended to seed and got it wrong.
      throw new Error(`[founderSeed] ${policy.reason}`);
    }
    // Dev / test: warn + skip. Operators sign in with their own
    // signed-up agency instead.
    // eslint-disable-next-line no-console
    console.warn(`[founderSeed] ${policy.reason}`);
    return;
  }

  const agencyName = readFounderAgencyName();

  let agency = getAgencyBySlug(FOUNDER_AGENCY_SLUG);
  if (!agency) {
    const result = await bootstrapAgency({
      name: agencyName,
      slug: FOUNDER_AGENCY_SLUG,
      ownerEmail: FOUNDER_EMAIL,
    });
    agency = result.agency;
  }

  // No more direct-mutate bypass. createUser runs validatePassword,
  // hashes, and emits user.signed_up — same path signup uses.
  const founder = createUser({
    email: FOUNDER_EMAIL,
    password: password!,
    role: "agency-owner",
    agencyId: agency.id,
    name: FOUNDER_NAME,
  });

  // R026: seed AquaOasis Demo + make Ed a master. Idempotent — second
  // run short-circuits on the slug check. Wrapped so a seed failure
  // doesn't tank the founder-seed (the demo agency is nice-to-have,
  // not load-bearing).
  try {
    const { seedAquaOasisDemo, addUserAgencyMembership } = await import("./aquaOasisSeed");
    const { agency: aquaAgency } = await seedAquaOasisDemo(founder.id);
    addUserAgencyMembership(founder.id, aquaAgency.id);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      "[founderSeed] AquaOasis Demo seed failed — switcher will only show Milesy Media:",
      e instanceof Error ? e.message : e,
    );
  }
}

// Test helper — purely for the smoke to reset the module-level cache
// between invocations. Not for prod use.
export function _resetFounderSeedForTests(): void {
  seedPromise = null;
  devSeedPromise = null;
  devSeedAt = 0;
}
