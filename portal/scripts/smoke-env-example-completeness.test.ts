// `.env.example` must name every value production actually requires.
//
// Issue #4, open since 2026-08-19: the file listed the two Supabase BUCKET
// names and none of the three credentials. The section looked complete, which
// is what made the omission survive months of review — nobody scanning it saw a
// gap, because the word "SUPABASE" was right there.
//
// This closes it by construction: the readiness inspector is the authority on
// what production needs, and every environment variable it checks has to appear
// in the file somebody copies. A new prerequisite that nobody documents now
// fails here rather than at 2am on a deploy.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const example = readFileSync(join(ROOT, ".env.example"), "utf-8");
const readiness = readFileSync(join(ROOT, "src/lib/server/productionReadiness.ts"), "utf-8");

/** Every `has(env, "X")` / `env.X` the readiness inspector consults. */
function requiredByReadiness(): string[] {
  const names = new Set<string>();
  for (const match of readiness.matchAll(/has\(env,\s*"([A-Z0-9_]+)"\)/g)) names.add(match[1]!);
  for (const match of readiness.matchAll(/env\.([A-Z][A-Z0-9_]{4,})/g)) names.add(match[1]!);
  // Set by the host, not by us — nothing to document.
  for (const hostSupplied of ["VERCEL_ENV", "NODE_ENV", "VERCEL_OIDC_TOKEN"]) names.delete(hostSupplied);
  return [...names].sort();
}

describe("the file somebody copies names everything production checks", () => {
  it("finds the readiness variables at all", () => {
    // A regex that stopped matching would make every assertion below pass by
    // vacuum, which is the usual way a completeness test stops checking.
    assert.ok(requiredByReadiness().length > 15,
      `only ${requiredByReadiness().length} readiness variables found — the scan is broken`);
  });

  it("documents every one of them", () => {
    const missing = requiredByReadiness().filter(name => !example.includes(name));
    assert.deepEqual(missing, [],
      `.env.example does not mention ${missing.join(", ")} — somebody configuring production would never know to set them`);
  });

  it("names the three Supabase credentials, not only the buckets", () => {
    // The exact shape of issue #4, pinned by name so it cannot come back the
    // same way: buckets present, keys absent, section looking finished.
    for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
      assert.ok(example.includes(key), `.env.example is missing ${key} (issue #4)`);
    }
  });

  it("never suggests putting the service-role key in a public variable", () => {
    // It bypasses row-level security. A `NEXT_PUBLIC_` prefix would ship it to
    // every browser, and the example file is what people copy without reading.
    assert.doesNotMatch(example, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/,
      "the service-role key is documented under a NEXT_PUBLIC_ name, which would publish it");
  });

  it("ships no real secret values", () => {
    // Every credential line must be empty or a placeholder. A real key
    // committed here is a leak that looks like documentation.
    const suspicious = example.split("\n").filter(line => {
      const match = line.match(/^([A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD|DSN))=(.+)$/);
      if (!match) return false;
      const value = match[3]!.trim();
      return value.length > 0 && !value.startsWith("<") && !value.startsWith("your-");
    });
    assert.deepEqual(suspicious, [], "a real-looking secret is committed in .env.example");
  });
});
