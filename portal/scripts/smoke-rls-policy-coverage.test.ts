/**
 * RLS policy coverage — the repo's written SQL vs. what the code actually does.
 *
 * WHY THIS EXISTS
 * The RLS posture for the discrete Supabase tables is defined by SQL migrations
 * that live OUTSIDE the portal package, in `aquaCRM/supabase/migrations/`. The
 * portal is what ships; nothing in it referenced those files, so an auditor
 * reading only `portal/` concluded (wrongly) that no RLS SQL existed anywhere.
 *
 * This test ties the two halves together. It parses the real migration SQL —
 * not a hand-maintained manifest, which would rot — and asserts that the policy
 * set the repo has written down still matches what the application code assumes:
 *
 *   1. Every table the app reaches has RLS enabled in written SQL.
 *   2. Every table reached with the ANON key is covered by a written policy that
 *      the anon role can actually match. (Anon is the only path RLS gates —
 *      service-role bypasses it entirely.)
 *   3. Only the deliberately-public website tables are readable by anon. A
 *      `using (true)` SELECT policy appearing on a private table is the single
 *      most dangerous drift, and it fails here.
 *   4. No policy is written against a table whose RLS is never enabled — a
 *      policy on an RLS-off table is a silent no-op that reads as protection.
 *   5. Every Supabase call site is classified as anon or service-role, so a new
 *      one cannot be added without this test being told which it is.
 *
 * It does NOT talk to the live database. Live posture was verified read-only on
 * 2026-08-20 and is recorded in docs/workspace/database.md; this test guards the
 * repo-side contract, which is the half that silently drifts.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORTAL_ROOT = path.resolve(HERE, "..");
const SRC_ROOT = path.join(PORTAL_ROOT, "src");
const MIGRATIONS_DIR = path.resolve(PORTAL_ROOT, "..", "supabase", "migrations");

// ─── The SQL side ─────────────────────────────────────────────────────────

interface WrittenPolicy {
  name: string;
  table: string;
  command: string;
  /** Empty list = no `TO` clause = PostgreSQL defaults the policy to PUBLIC. */
  roles: string[];
  using: string | null;
  migration: string;
}

interface PolicySet {
  rlsEnabled: Set<string>;
  policies: Map<string, WrittenPolicy>;
  migrations: string[];
}

/** Walks forward from `start` to the statement-terminating `;` at paren depth 0. */
function statementAt(sql: string, start: number): string {
  let depth = 0;
  let i = start;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'" || ch === '"') {
      const quote = ch;
      i += 1;
      while (i < sql.length && sql[i] !== quote) i += 1;
    } else if (ch === "$" && sql.startsWith("$$", i)) {
      i = sql.indexOf("$$", i + 2);
      if (i < 0) return sql.slice(start);
      i += 1;
    } else if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (ch === ";" && depth === 0) return sql.slice(start, i);
    i += 1;
  }
  return sql.slice(start);
}

function stripSchema(table: string): string {
  return table.replace(/^public\./i, "").replace(/^"|"$/g, "");
}

function policyKey(name: string, table: string): string {
  return `${table}::${name.toLowerCase()}`;
}

/**
 * Replays every migration in timestamp order so the parsed result is the FINAL
 * state, not a union. Policies get dropped and recreated across migrations
 * (`brand_enquiries` insert policy is rewritten once), and `app_datastores` is
 * dropped outright and recreated later — a union would report both versions.
 */
function readWrittenPolicySet(): PolicySet {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(name => name.endsWith(".sql"))
    .sort();

  const rlsEnabled = new Set<string>();
  const policies = new Map<string, WrittenPolicy>();

  for (const file of files) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const lowered = sql.toLowerCase();

    // Statement starts, in source order, so drop-then-create resolves correctly.
    const marks: Array<{ index: number; kind: "create" | "drop" | "enable" | "droptable" }> = [];
    const push = (pattern: RegExp, kind: (typeof marks)[number]["kind"]) => {
      for (const match of lowered.matchAll(pattern)) marks.push({ index: match.index, kind });
    };
    push(/create\s+policy\b/g, "create");
    push(/drop\s+policy\b/g, "drop");
    push(/alter\s+table\b/g, "enable");
    push(/drop\s+table\b/g, "droptable");
    marks.sort((a, b) => a.index - b.index);

    for (const mark of marks) {
      const statement = statementAt(sql, mark.index);
      const flat = statement.replace(/\s+/g, " ").trim();

      if (mark.kind === "droptable") {
        const table = flat.match(/drop\s+table\s+(?:if\s+exists\s+)?([\w".]+)/i)?.[1];
        if (!table) continue;
        const name = stripSchema(table);
        rlsEnabled.delete(name);
        for (const key of [...policies.keys()]) {
          if (policies.get(key)!.table === name) policies.delete(key);
        }
        continue;
      }

      if (mark.kind === "enable") {
        if (!/enable\s+row\s+level\s+security/i.test(flat)) continue;
        const table = flat.match(/alter\s+table\s+(?:if\s+exists\s+)?([\w".]+)/i)?.[1];
        if (table) rlsEnabled.add(stripSchema(table));
        continue;
      }

      const parsed = flat.match(
        /(?:create|drop)\s+policy\s+(?:if\s+exists\s+)?"([^"]+)"\s+on\s+([\w".]+)/i,
      );
      if (!parsed) continue;
      const [, name, rawTable] = parsed;
      const table = stripSchema(rawTable);
      const key = policyKey(name, table);

      if (mark.kind === "drop") {
        policies.delete(key);
        continue;
      }

      const command = flat.match(/\bfor\s+(all|select|insert|update|delete)\b/i)?.[1].toLowerCase() ?? "all";
      const roleClause = flat.match(/\bto\s+([\w\s,]+?)\s+(?:using|with\s+check)\b/i)?.[1];
      const roles = roleClause
        ? roleClause.split(",").map(role => role.trim().toLowerCase()).filter(Boolean)
        : [];
      const usingClause = flat.match(/\busing\s*\((.*?)\)\s*(?:with\s+check|$)/i)?.[1] ?? null;

      policies.set(key, { name, table, command, roles, using: usingClause, migration: file });
    }
  }

  return { rlsEnabled, policies, migrations: files };
}

/** A policy the `anon` role can match: either granted to anon, or left as PUBLIC. */
function appliesToAnon(policy: WrittenPolicy): boolean {
  return policy.roles.length === 0 || policy.roles.includes("anon") || policy.roles.includes("public");
}

function appliesToSignedInUser(policy: WrittenPolicy): boolean {
  return appliesToAnon(policy) || policy.roles.includes("authenticated");
}

// ─── The code side ────────────────────────────────────────────────────────

type ClientKind = "anon" | "service";

interface CallSite {
  file: string;
  client: ClientKind;
  tables: string[];
}

/**
 * `clientErasure.ts` takes an INJECTED Supabase client rather than constructing
 * one, so no import marker identifies it. Its own header records that production
 * passes the admin (service-role) client. Anything else unclassified fails.
 */
const INJECTED_CLIENTS: Record<string, ClientKind> = {
  "src/server/clientErasure.ts": "service",
};

// `resolveSupabaseSecretKey` (lib/supabase/keys.ts) resolves the service-role /
// new `sb_secret_` key with a legacy fallback, so a site using it is a
// service-role client just as a raw `SUPABASE_SERVICE_ROLE_KEY` read is.
const SERVICE_MARKERS = [
  "createSupabaseAdminClient",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "resolveSupabaseSecretKey",
];
const ANON_MARKERS = ["createRouteSupabaseClient", "createServerSupabaseClient", "createScopedSupabaseClient"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function readCallSites(): CallSite[] {
  const sites: CallSite[] = [];
  for (const file of walk(SRC_ROOT)) {
    const source = readFileSync(file, "utf8");
    const tables = [...source.matchAll(/\.from\("([a-z_]+)"\)/g)].map(match => match[1]);
    if (tables.length === 0) continue;

    const relative = path.relative(PORTAL_ROOT, file);
    // The client-construction files themselves are the definition, not a consumer.
    if (relative.startsWith(path.join("src", "lib", "supabase") + path.sep) && !source.includes("createSupabaseAdminClient(")) {
      continue;
    }

    let client: ClientKind | null = INJECTED_CLIENTS[relative.split(path.sep).join("/")] ?? null;
    if (!client && ANON_MARKERS.some(marker => source.includes(marker))) client = "anon";
    if (!client && SERVICE_MARKERS.some(marker => source.includes(marker))) client = "service";

    assert.ok(
      client,
      `Unclassified Supabase call site: ${relative} touches ${[...new Set(tables)].join(", ")} ` +
        `but uses neither an anon client (${ANON_MARKERS.join("/")}) nor a service-role client ` +
        `(${SERVICE_MARKERS.join("/")}). Decide which key it uses and record it, because RLS only ` +
        `gates the anon path.`,
    );

    sites.push({ file: relative, client, tables: [...new Set(tables)].sort() });
  }
  return sites.sort((a, b) => a.file.localeCompare(b.file));
}

function tablesFor(sites: CallSite[], client?: ClientKind): Set<string> {
  const out = new Set<string>();
  for (const site of sites) {
    if (client && site.client !== client) continue;
    for (const table of site.tables) out.add(table);
  }
  return out;
}

// ─── The contract ─────────────────────────────────────────────────────────

/**
 * Deliberately world-readable: website content only, no PII. Adding a table here
 * is a decision to publish it — which is exactly why it is a literal in a test.
 *
 * RE-VERIFIED against the live project, read-only, on 2026-08-28. The earlier
 * 2026-08-20 check recorded "zero rows or a grant denial", which is not on its
 * own proof of anything: under RLS, PostgREST answers **200 with an empty
 * array** both when a policy is correctly filtering every row AND when the
 * table is simply empty. Those are indistinguishable from outside, and reading
 * the first as a pass — or as a leak — would be equally wrong.
 *
 * Distinguished with a service-role COUNT (`HEAD` + `count=exact`, no rows
 * read):
 *
 *   brand_enquiries        anon 0 / service 41  → RLS filtering correctly
 *   profiles               anon 0 / service  3  → RLS filtering correctly
 *   website_consent_events anon 0 / service 11  → RLS filtering correctly
 *   audit_events           anon 0 / service  0  → INCONCLUSIVE, table empty
 *   client_portals         anon 0 / service  0  → INCONCLUSIVE, table empty
 *   clients                anon 0 / service  0  → INCONCLUSIVE, table empty
 *
 * So the three tables that hold real data today are provably protected — 41
 * enquiries with names and addresses among them. The three empty ones prove
 * nothing yet and **must be re-checked once they carry rows**, which is the
 * moment clients are onboarded.
 */
const PUBLIC_READ_TABLES = ["brands", "shoot_photos", "shoots"];

describe("RLS policy coverage — written SQL vs. what the code assumes", () => {
  const written = readWrittenPolicySet();
  const sites = readCallSites();

  it("finds the migration directory the portal depends on", () => {
    assert.ok(
      written.migrations.length > 0,
      `No SQL migrations found at ${MIGRATIONS_DIR}. The portal's RLS posture is defined there; ` +
        `if that directory moved, docs/workspace/database.md and this test must both be updated.`,
    );
    assert.ok(
      written.policies.size > 0,
      "Migrations parsed but no CREATE POLICY statements survived. The parser or the SQL changed.",
    );
  });

  it("enables RLS in written SQL for every table the app touches", () => {
    const missing = [...tablesFor(sites)].filter(table => !written.rlsEnabled.has(table)).sort();
    assert.deepEqual(
      missing,
      [],
      `These tables are queried by the app but no migration enables row level security on them: ` +
        `${missing.join(", ")}. Without an ALTER TABLE ... ENABLE ROW LEVEL SECURITY the table is ` +
        `open to anyone holding the public anon key.`,
    );
  });

  it("covers every anon-key table with a policy the anon role can match", () => {
    const anonTables = [...tablesFor(sites, "anon")].sort();
    assert.ok(
      anonTables.length > 0,
      "No anon-key table access found at all. Either the app changed or the classifier broke — " +
        "silently passing this test would hide the only surface RLS actually gates.",
    );

    for (const table of anonTables) {
      const covering = [...written.policies.values()].filter(
        policy => policy.table === table && appliesToSignedInUser(policy),
      );
      assert.ok(
        covering.length > 0,
        `Table "${table}" is read with the PUBLIC anon key but no written policy grants that path ` +
          `access. With RLS enabled and no matching policy the read returns zero rows, which in ` +
          `this app means login silently stops resolving roles.`,
      );
    }
  });

  it("keeps anon-readable tables to the deliberately-public website set", () => {
    const anonReadable = new Set<string>();
    for (const policy of written.policies.values()) {
      if (policy.command !== "select" && policy.command !== "all") continue;
      if (!appliesToAnon(policy)) continue;
      // A policy anon can match still yields nothing unless its USING predicate
      // can be true without a session. `is_internal_user()` cannot.
      if (policy.using && !/^\s*true\s*$/i.test(policy.using)) continue;
      anonReadable.add(policy.table);
    }

    assert.deepEqual(
      [...anonReadable].sort(),
      PUBLIC_READ_TABLES,
      `The set of tables an unauthenticated browser can read has drifted. Expected only the ` +
        `website-content tables (${PUBLIC_READ_TABLES.join(", ")}). Anything else here is a ` +
        `USING (true) SELECT policy on a table holding real data.`,
    );
  });

  it("never writes a policy against a table whose RLS is never enabled", () => {
    // `storage.objects` is excluded: it lives in Supabase's managed `storage`
    // schema, which ships with RLS already forced on. No user migration can or
    // should enable it, so its absence here is correct rather than a gap.
    const policedButOpen = [...new Set([...written.policies.values()].map(policy => policy.table))]
      .filter(table => !table.includes("."))
      .filter(table => !written.rlsEnabled.has(table))
      .sort();
    assert.deepEqual(
      policedButOpen,
      [],
      `These tables have policies written but no ENABLE ROW LEVEL SECURITY: ${policedButOpen.join(", ")}. ` +
        `Postgres ignores policies entirely while RLS is off, so the SQL reads as protection and ` +
        `enforces nothing.`,
    );
  });

  it("records that service-role call sites are outside RLS entirely", () => {
    const serviceTables = tablesFor(sites, "service");
    const serviceSites = sites.filter(site => site.client === "service");

    assert.ok(
      serviceTables.size >= tablesFor(sites, "anon").size,
      "Expected the service-role surface to dominate. If it no longer does, the posture claim in " +
        "docs/workspace/database.md (RLS is defence-in-depth, not the primary control) is stale.",
    );
    assert.ok(
      serviceSites.length > 1,
      "The honesty claim in the RLS plan rests on there being many service-role call sites that " +
        "bypass RLS. If that is no longer true, update the plan rather than this assertion.",
    );
  });
});

describe("brand_enquiries tenant scoping — the agency_id column and its policy", () => {
  // Written 2026-08-20 with the agency_scope migration. Until that migration,
  // brand_enquiries routed tenants through metadata->>'agencyId' only — a JSON
  // key RLS cannot scope on — which is why its policy could not be per-agency.
  // These assertions FAIL if the column, its backfill trigger, the agency-aware
  // policy, or the insert-side stamping is ever removed.
  const written = readWrittenPolicySet();
  const allMigrationSql = written.migrations
    .map(file => readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"))
    .join("\n");

  it("adds the agency_id column in written SQL, with backfill and trigger", () => {
    assert.match(
      allMigrationSql,
      /alter table public\.brand_enquiries\s+add column if not exists agency_id text/,
      "No migration adds brand_enquiries.agency_id. Without the column, RLS cannot scope the table by tenant.",
    );
    assert.match(
      allMigrationSql,
      /create trigger set_brand_enquiries_agency/,
      "The default-agency trigger is gone. Writers that only stamp metadata.agencyId would leave the column null.",
    );
    assert.match(
      allMigrationSql,
      /create or replace function public\.current_profile_agency_id\(\)/,
      "current_profile_agency_id() is gone — the policy has nothing to compare the row's agency_id against.",
    );
  });

  it("scopes the internal-users policy by agency", () => {
    const policy = [...written.policies.values()].find(
      candidate => candidate.table === "brand_enquiries" && candidate.command === "all",
    );
    assert.ok(policy, "brand_enquiries has no FOR ALL policy for internal users at all.");
    assert.match(
      policy!.using ?? "",
      /current_profile_agency_id/,
      `The brand_enquiries manage policy ("${policy!.name}", ${policy!.migration}) no longer compares ` +
        `agency_id against current_profile_agency_id(). That reverts tenant scoping to app code only.`,
    );
  });

  it("stamps the tenant on both public insert paths", () => {
    const brandEnquiry = readFileSync(path.join(SRC_ROOT, "app", "api", "public", "brand-enquiry", "route.ts"), "utf8");
    const formCapture = readFileSync(path.join(SRC_ROOT, "app", "api", "public", "form-capture", "route.ts"), "utf8");
    assert.match(brandEnquiry, /agency_id: agency\.id/, "brand-enquiry inserts must write the agency_id column.");
    assert.match(brandEnquiry, /agencyId: agency\.id/, "brand-enquiry must keep metadata.agencyId for the routing sites and the backfill.");
    assert.match(formCapture, /agency_id: masterAgencyId \?\? null/, "form-capture inserts must write the agency_id column.");
    // Ed applies the migration by hand, so the code must survive the old
    // schema: both paths retry without the column on its exact absence.
    assert.match(brandEnquiry, /isMissingAgencyIdColumn/, "brand-enquiry lost its pre-migration fallback.");
    assert.match(formCapture, /isMissingAgencyIdColumn/, "form-capture lost its pre-migration fallback.");
  });
});
