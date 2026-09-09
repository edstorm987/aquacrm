// Restore-drill SAFETY semantics (assume-breach containment, Phase 5/7).
//
// The drill must default-DENY any target it cannot prove is disposable, and
// must FAIL (non-zero) rather than warn on a missing/failed verification. These
// are behavioural tests — they actually run ops/backup/restore-drill.sh with a
// mock `psql`/`openssl`/`tar` on PATH, not `bash -n` alone — because the point
// is the refusal semantics, which a syntax check cannot exercise.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, rmSync, existsSync } from "node:fs";
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
    `#!/usr/bin/env bash\nfor a in "$@"; do case "$a" in\n  *restore_drill_disposable*) echo "${psqlMarker}";;\n  *aquacrm.environment*) echo "";;\n  *current_database*) echo "scratch_local";;\nesac; done\nexit 0\n`,
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

test("LOOPBACK is NOT auto-trusted: a localhost target without the disposable marker is refused", () => {
  // A localhost endpoint can be an SSH tunnel to production — so loopback must
  // still PROVE it is disposable.
  const fx = fixture(""); // marker absent
  try {
    const r = run([fx.cms, "--key", fx.key, "--expect-sha", "deadbeef", "--target", "postgresql://u:p@127.0.0.1:54322/postgres"], fx.env);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /disposable marker|cannot prove|NOT trusted/i);
  } finally {
    rmSync(fx.dir, { recursive: true, force: true });
  }
});

test("a target whose database name looks like production is refused (even on loopback with the marker)", () => {
  const dir = mkdtempSync(join(tmpdir(), "restore-drill-prod-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "psql"), `#!/usr/bin/env bash\nfor a in "$@"; do case "$a" in\n  *restore_drill_disposable*) echo "yes";;\n  *current_database*) echo "aquacrm_production";;\nesac; done\nexit 0\n`);
  writeFileSync(join(bin, "openssl"), `#!/usr/bin/env bash\nexit 0\n`);
  for (const f of ["psql", "openssl"]) chmodSync(join(bin, f), 0o755);
  const cms = join(dir, "s.cms"); writeFileSync(cms, "x");
  const key = join(dir, "k.pem"); writeFileSync(key, "x");
  try {
    const r = spawnSync("bash", [SCRIPT, cms, "--key", key, "--expect-sha", "deadbeef"], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` }, encoding: "utf8", timeout: 30_000,
    });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /looks like production|Refusing/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the expected digest is MANDATORY (a restore without --expect-sha is refused)", () => {
  const fx = fixture("yes");
  try {
    const r = run([fx.cms, "--key", fx.key], fx.env); // no --expect-sha
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /--expect-sha|verified digest/i);
  } finally {
    rmSync(fx.dir, { recursive: true, force: true });
  }
});

test("a malicious archive with a path-traversal entry is refused before extraction (real tar)", () => {
  const dir = mkdtempSync(join(tmpdir(), "restore-drill-tar-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  // Build a REAL malicious tar.gz containing a `../escape` entry (portable —
  // Python's tarfile, since GNU tar --transform is not on macOS bsdtar).
  const evil = join(dir, "evil.tar.gz");
  const built = spawnSync("python3", ["-c",
    `import tarfile,io,sys\n` +
    `t=tarfile.open(sys.argv[1],'w:gz')\n` +
    `info=tarfile.TarInfo('../escape')\n` +
    `data=b'pwned'\n` +
    `info.size=len(data)\n` +
    `t.addfile(info, io.BytesIO(data))\n` +
    `t.close()\n`, evil], { encoding: "utf8" });
  assert.equal(built.status, 0, `could not build the malicious tar: ${built.stderr}`);
  // Mock psql (disposable, non-prod) and openssl that COPIES the malicious tar
  // to the decrypt output; use the REAL tar for listing/extraction.
  writeFileSync(join(bin, "psql"), `#!/usr/bin/env bash\nfor a in "$@"; do case "$a" in\n  *restore_drill_disposable*) echo "yes";;\n  *current_database*) echo "scratch";;\nesac; done\nexit 0\n`);
  writeFileSync(join(bin, "openssl"), `#!/usr/bin/env bash\nout=""; while [ $# -gt 0 ]; do [ "$1" = "-out" ] && out="$2"; shift; done\ncp '${evil}' "$out"\nexit 0\n`);
  chmodSync(join(bin, "psql"), 0o755); chmodSync(join(bin, "openssl"), 0o755);
  const cms = join(dir, "s.cms"); writeFileSync(cms, "x");
  const key = join(dir, "k.pem"); writeFileSync(key, "x");
  const sha = spawnSync("bash", ["-c", `shasum -a 256 '${cms}' | awk '{print $1}'`], { encoding: "utf8" }).stdout.trim();
  try {
    const r = spawnSync("bash", [SCRIPT, cms, "--key", key, "--expect-sha", sha], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` }, encoding: "utf8", timeout: 30_000,
    });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /path-traversal|absolute path|refusing to extract/i);
    // The traversal target must NOT have been written outside the work dir.
    assert.equal(existsSync(join(dir, "escape.extracted")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
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
