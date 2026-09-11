import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const PORTAL = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = join(PORTAL, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

test("the standalone client portal CI install is locked and reproducible", () => {
  assert.equal(existsSync(join(ROOT, "client-portal/package-lock.json")), true);
  const workflow = read(".github/workflows/ci.yml");
  const job = workflow.slice(workflow.indexOf("  client-portal:"), workflow.indexOf("  browser:"));
  assert.match(job, /working-directory: client-portal/);
  assert.match(job, /run: npm ci --no-audit --no-fund/);
  assert.doesNotMatch(job, /run: npm install\b/);
});

test("every third-party action in the credentialed backup workflow is immutable", () => {
  const workflow = read(".github/workflows/db-backup.yml");
  const actionRefs = [...workflow.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/gm)].map(match => match[1]!);
  assert.ok(actionRefs.length >= 3, "backup action pin scan matched too little");
  for (const ref of actionRefs) {
    assert.match(ref, /@[0-9a-f]{40}$/i, `${ref} is mutable; pin the reviewed full commit SHA`);
  }
  assert.match(
    workflow,
    /supabase\/setup-cli@ab058987d8d6c725971f6cf9d0b5c98467e30bd1 # v1\.7\.1/,
    "the Supabase CLI action must stay on the independently resolved v1.7.1 commit",
  );
});
