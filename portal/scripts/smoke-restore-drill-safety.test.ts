// Restore-drill SAFETY semantics (assume-breach containment, Phase 5/7).
//
// The drill must default-DENY any target it cannot prove is disposable, and
// must FAIL (non-zero) rather than warn on a missing/failed verification. These
// are behavioural tests — they actually run ops/backup/restore-drill.sh with a
// mock `psql`/`openssl`/`tar` on PATH, not `bash -n` alone — because the point
// is the refusal semantics, which a syntax check cannot exercise.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(REPO, "ops", "backup", "restore-drill.sh");

/** Build a throwaway PATH dir with mock psql/openssl/tar, plus a fake snapshot + key. */
function fixture(psqlMarker: string): { dir: string; env: NodeJS.ProcessEnv; cms: string; key: string } {
  const dir = mkdtempSync(join(tmpdir(), "restore-drill-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  // Mock psql: echo the marker value for current_setting queries, empty otherwise.
  writeFileSync(
    join(bin, "psql"),
    `#!/usr/bin/env bash\nfor a in "$@"; do case "$a" in\n  *restore_drill_disposable*) echo "${psqlMarker}";;\n  *aquacrm.environment*) echo "";;\nesac; done\nexit 0\n`,
  );
  // Mock openssl/tar so command -v finds them and decrypt "succeeds" if reached.
  writeFileSync(join(bin, "openssl"), `#!/usr/bin/env bash\nexit 0\n`);
  writeFileSync(join(bin, "tar"), `#!/usr/bin/env bash\nexit 0\n`);
  for (const f of ["psql", "openssl", "tar"]) chmodSync(join(bin, f), 0o755);
  const cms = join(dir, "snap.tar.gz.cms");
  writeFileSync(cms, "not-really-encrypted-but-nonempty");
  const key = join(dir, "key.pem");
  writeFileSync(key, "-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n");
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` };
  return { dir, env, cms, key };
}

function run(args: string[], env: NodeJS.ProcessEnv) {
  return spawnSync("bash", [SCRIPT, ...args], { env, encoding: "utf8", timeout: 30_000 });
}

test("refuses when no snapshot argument is given", () => {
  const fx = fixture("yes");
  try {
    const r = run([], fx.env);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /encrypted snapshot/i);
  } finally {
    rmSync(fx.dir, { recursive: true, force: true });
  }
});

test("refuses a known LIVE Supabase host unconditionally, even with the opt-in flag", () => {
  const fx = fixture("yes");
  try {
    const r = run([fx.cms, "--key", fx.key, "--target", "postgresql://u:p@db.abcdefgh.supabase.co:5432/postgres", "--allow-nonlocal-disposable"], fx.env);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /LIVE Supabase endpoint|Refusing/i);
  } finally {
    rmSync(fx.dir, { recursive: true, force: true });
  }
});

test("DEFAULT-DENIES a non-local target without the explicit opt-in flag", () => {
  const fx = fixture("yes");
  try {
    const r = run([fx.cms, "--key", fx.key, "--target", "postgresql://u:p@10.0.0.5:5432/scratch"], fx.env);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /DEFAULT-DENIED|not loopback/i);
  } finally {
    rmSync(fx.dir, { recursive: true, force: true });
  }
});

test("refuses a non-local target that cannot PROVE it is disposable (marker absent)", () => {
  const fx = fixture(""); // psql returns empty marker
  try {
    const r = run([fx.cms, "--key", fx.key, "--target", "postgresql://u:p@10.0.0.5:5432/scratch", "--allow-nonlocal-disposable"], fx.env);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /disposable marker|cannot prove/i);
  } finally {
    rmSync(fx.dir, { recursive: true, force: true });
  }
});

test("refuses on a snapshot digest mismatch (does not trust the file)", () => {
  const fx = fixture("yes");
  try {
    // Local target passes the safety gate; the sha check runs next and must fail.
    const r = run([fx.cms, "--key", fx.key, "--expect-sha", "0000000000000000000000000000000000000000000000000000000000000000"], fx.env);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /sha256 mismatch|do NOT trust/i);
  } finally {
    rmSync(fx.dir, { recursive: true, force: true });
  }
});

test("the generic bypass flag is gone (the old --i-know-this-is-a-branch is rejected)", () => {
  const fx = fixture("yes");
  try {
    const r = run([fx.cms, "--key", fx.key, "--i-know-this-is-a-branch"], fx.env);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /unknown flag/i);
  } finally {
    rmSync(fx.dir, { recursive: true, force: true });
  }
});

test("the script source turns verification gaps into FAIL, not WARN", () => {
  const src = spawnSync("cat", [SCRIPT], { encoding: "utf8" }).stdout;
  assert.match(src, /FAIL .*manifest.*is missing/i, "a missing manifest must FAIL");
  assert.match(src, /FAIL public\.\* row-count mismatch/i, "a public.* count mismatch must FAIL");
  assert.match(src, /FAIL rls-verify/i, "an rls-verify FAIL row must FAIL");
  assert.match(src, /FAIL ensure_rls still absent/i, "a missing event trigger must FAIL");
  assert.doesNotMatch(src, /FORCE_REMOTE/, "the generic remote-bypass variable must be gone");
});
