#!/usr/bin/env bash
# Restore an AquaCRM encrypted snapshot into a SCRATCH database and verify it.
# This is how you PROVE a backup is real. A snapshot you have never restored is
# theatre. Run it after your first backup, then on a schedule (quarterly).
#
# It NEVER points at production: the prod guard refuses any live Supabase host
# unless you explicitly pass --i-know-this-is-a-branch (for a disposable branch).
# Default target is a local `supabase start` database.
#
# Usage:
#   ops/backup/restore-drill.sh <snapshot.tar.gz.cms> \
#       [--key <key.pem>] [--passin <openssl-passin>] \
#       [--target <psql-url>] [--expect-sha <sha256>] [--i-know-this-is-a-branch]
#
# Requires: openssl (macOS ships it) and psql 17 (brew install libpq, or
#           postgresql@17) and a running scratch target (supabase start).
set -euo pipefail
log() { printf '%s %s\n' "[$(date -u +%H:%M:%S)]" "$*" >&2; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

CMS=""; KEY=""; TARGET="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
EXPECT=""; PASSIN=""; ALLOW_NONLOCAL=0
while [ $# -gt 0 ]; do
  case "$1" in
    --key) KEY="$2"; shift 2;;
    --passin) PASSIN="$2"; shift 2;;
    --target) TARGET="$2"; shift 2;;
    --expect-sha) EXPECT="$2"; shift 2;;
    # A non-local target is DEFAULT-DENIED. This flag is NOT a bypass: it only
    # says "I intend a non-local target"; the target must STILL prove it is
    # disposable via the on-target marker check below, so the flag alone can
    # never point the drill at production.
    --allow-nonlocal-disposable) ALLOW_NONLOCAL=1; shift;;
    -h|--help) sed -n '2,30p' "$0"; exit 0;;
    -*) die "unknown flag $1";;
    *) CMS="$1"; shift;;
  esac
done

[ -n "$CMS" ] && [ -s "$CMS" ] || die "Pass the encrypted snapshot (.tar.gz.cms) as the first argument."

command -v openssl >/dev/null 2>&1 || die "openssl not found."
command -v psql >/dev/null 2>&1 || die "psql not found. Install: brew install libpq && add /opt/homebrew/opt/libpq/bin to PATH."

# --- TARGET SAFETY (default-deny; before anything destructive) ---------------
# Safety is NOT decided by hostname pattern (a prod host can hide behind a proxy,
# a pooler, an IP or an SSH tunnel). The rule is:
#   • a genuinely LOCAL loopback target is allowed (a dev `supabase start`); OR
#   • ANY other target must (a) be explicitly opted into with
#     --allow-nonlocal-disposable AND (b) POSITIVELY PROVE it is disposable by
#     carrying the marker `ALTER DATABASE <db> SET aquacrm.restore_drill_disposable = 'yes'`
#     in its own configuration, which a production database will never have.
# Both are required; neither alone suffices. A known live Supabase endpoint is
# refused outright regardless of flags.
host="$(printf '%s' "$TARGET" | sed -E 's#^[a-z]+://[^@]*@?([^:/?]+).*#\1#')"
is_local=0
case "$host" in
  127.0.0.1|localhost|::1) is_local=1;;
esac
# Known live endpoints are refused outright, whatever the flags.
case "$host" in
  *pooler.supabase.com|*.supabase.co|*.supabase.in)
    die "Target host '$host' is a LIVE Supabase endpoint. Refusing unconditionally — a restore drill must never touch it.";;
esac

# LOOPBACK IS NOT AUTOMATICALLY TRUSTED (Item 10): a localhost endpoint can be
# an SSH tunnel or a port-forward to production. EVERY target — loopback
# included — must POSITIVELY PROVE it is disposable before any destructive
# command, via a marker set ON the target database itself, and must NOT identify
# as production. A non-local target additionally requires the explicit opt-in.
if [ "$is_local" != 1 ] && [ "$ALLOW_NONLOCAL" != 1 ]; then
  die "Target '$host' is not loopback. A non-local target is DEFAULT-DENIED — pass --allow-nonlocal-disposable AND set the disposable marker on it."
fi
marker="$(psql "$TARGET" -Atqc "select current_setting('aquacrm.restore_drill_disposable', true)" 2>/dev/null || true)"
[ "$marker" = "yes" ] || die "Target '$host' does not carry the disposable marker. Refusing: cannot prove this database is disposable (loopback is NOT trusted on its own — it may tunnel to prod). On a REAL scratch DB run: ALTER DATABASE <db> SET aquacrm.restore_drill_disposable = 'yes'. NEVER set it on production."
# Explicit denial of a production self-identification and known prod db names.
appenv="$(psql "$TARGET" -Atqc "select current_setting('aquacrm.environment', true)" 2>/dev/null || true)"
[ "$appenv" = "production" ] && die "Target identifies as production (aquacrm.environment='production'). Refusing."
dbid="$(psql "$TARGET" -Atqc "select current_database()" 2>/dev/null || true)"
case "$dbid" in
  *prod*|*production*|*live*) die "Target database name '$dbid' looks like production. Refusing.";;
esac
log "Target '$host' (db='$dbid') proved disposable (marker present, not production); proceeding."

[ -n "$KEY" ] || KEY="$HERE/_local/aquacrm-backup.key.pem"
[ -s "$KEY" ] || die "Private key not found at $KEY (pass --key). Keep it OFFLINE; this drill reads it locally only."

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

# --- Integrity (MANDATORY), then decrypt ---
# The expected digest is REQUIRED (Item 10): a restore you cannot pin to a known
# artifact is a restore you cannot trust.
[ -n "$EXPECT" ] || die "Pass --expect-sha <sha256> — the independently-recorded digest of the snapshot. A restore without a verified digest is refused."
have="$(sha256 "$CMS" | awk '{print $1}')"
log "snapshot sha256=$have"
[ "$EXPECT" = "$have" ] || die "sha256 mismatch: expected $EXPECT got $have — do NOT trust this file."

log "Decrypting"
openssl cms -decrypt -binary -inform DER -in "$CMS" -inkey "$KEY" ${PASSIN:+-passin "$PASSIN"} -out "$WORK/bundle.tar.gz" \
  || die "Decrypt failed (wrong key or passphrase?)."

# SAFE EXTRACTION (Item 10): reject path traversal, absolute paths and symlinks
# BEFORE extracting — a malicious/backdoored archive must not write outside WORK.
entries="$(tar -tzf "$WORK/bundle.tar.gz")" || die "Could not read the archive listing."
if printf '%s\n' "$entries" | grep -qE '(^|/)\.\.(/|$)|^/'; then
  die "Archive contains a path-traversal or absolute path entry — refusing to extract."
fi
# Reject symlink/hardlink/device entries (only regular files + dirs are allowed).
if tar -tvzf "$WORK/bundle.tar.gz" | grep -qE '^[hlbcp]'; then
  die "Archive contains a symlink/hardlink/special entry — refusing to extract."
fi
tar --no-same-owner -xzf "$WORK/bundle.tar.gz" -C "$WORK"
for f in roles.sql schema.sql data.sql; do [ -s "$WORK/$f" ] || die "missing $f in snapshot"; done

# --- Deterministic sanitise (official Supabase restore guidance). These lines
#     abort a --single-transaction restore; a routine drill cannot hand-edit. ---
sed -i.bak -E '/OWNER TO "?supabase_admin"?/d' "$WORK/schema.sql"
sed -i.bak -E '/ALTER +FUNCTION[^;]*OWNER TO "?supabase_admin"?/d' "$WORK/schema.sql"
sed -i.bak -E '/GRANT +"?postgres"? +TO +"?cli_login_postgres"?/d' "$WORK/roles.sql"
rm -f "$WORK"/*.bak

# Prepare the scratch target so the snapshot loads into a CLEAN slate. A branch /
# 'supabase start' has already run migrations, so its public tables and its
# platform storage/auth rows (e.g. the storage.buckets created by a migration)
# would collide with the dump. This drops public and clears auth+storage data on
# the scratch target — a restore overwrites the target by definition, and the
# prod guard above has already refused any live host.
log "Preparing scratch target on '$host' (drop public; clear auth/storage data). This OVERWRITES the target."
psql "$TARGET" -q -v ON_ERROR_STOP=1 <<'SQL' || die "target preparation failed"
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
DO $do$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('auth','storage') ORDER BY 1,2 LOOP
    BEGIN
      EXECUTE format('TRUNCATE TABLE %I.%I CASCADE', r.schemaname, r.tablename);
    EXCEPTION WHEN OTHERS THEN
      -- platform catalog tables (auth.schema_migrations, storage.migrations, the
      -- vector tables) are not truncatable by the restricted postgres and carry
      -- no user data; the dump excludes them too, so skipping is correct.
      RAISE NOTICE 'skip truncate %.% (%)', r.schemaname, r.tablename, SQLERRM;
    END;
  END LOOP;
END
$do$;
SQL

# Roles first, BEST-EFFORT. A Supabase target already has the standard roles and
# their configs; roles.sql also carries superuser-only lines (e.g. GRANT SET ON
# PARAMETER log_min_messages) that 'supabase start' refuses. Applying it without
# ON_ERROR_STOP sets what it can (statement_timeout etc.) and skips the rest,
# instead of aborting the whole restore.
log "Restoring roles (best-effort — role configs already exist on a Supabase target)"
psql "$TARGET" -f "$WORK/roles.sql" >/dev/null 2>&1 \
  || log "  note: some role statements were skipped (expected on 'supabase start' / a branch)."

# Schema + data is where integrity matters: ONE transaction, stop on any error.
log "Restoring schema + data into '$host' (single transaction, ON_ERROR_STOP=1, replica for data)"
psql "$TARGET" --single-transaction -v ON_ERROR_STOP=1 \
  -f "$WORK/schema.sql" \
  -c 'SET session_replication_role = replica' \
  -f "$WORK/data.sql" \
  || die "Restore failed. If it aborted on an OWNER/GRANT line, add that pattern to the sanitise step above."

# --- Verification ---
log "Verifying"
fail=0

users="$(psql "$TARGET" -Atqc 'select count(*) from auth.users' 2>/dev/null || echo 0)"
if [ "${users:-0}" -gt 0 ]; then log "PASS auth.users rows: $users"
else log "FAIL auth.users is empty after restore — logins would be gone (is the data dump missing the auth schema?)."; fail=1; fi

et="$(psql "$TARGET" -Atqc "select count(*) from pg_event_trigger where evtname='ensure_rls'" 2>/dev/null || echo 0)"
if [ "${et:-0}" -gt 0 ]; then
  log "PASS ensure_rls event trigger present"
else
  # Scoped dumps omit cluster-level event triggers, and DROP SCHEMA public cascades
  # away rls_auto_enable() (which schema.sql recreates without the trigger). Re-apply
  # from the migration so the restored DB keeps the defence-in-depth RLS net.
  ETRIG="$REPO/supabase/migrations/20260903130000_ensure_rls_event_trigger.sql"
  if [ -s "$ETRIG" ]; then
    log "ensure_rls event trigger absent (scoped dump) — re-applying from migration"
    psql "$TARGET" -v ON_ERROR_STOP=1 -f "$ETRIG" >/dev/null 2>&1 || true
    et="$(psql "$TARGET" -Atqc "select count(*) from pg_event_trigger where evtname='ensure_rls'" 2>/dev/null || echo 0)"
    if [ "${et:-0}" -gt 0 ]; then log "PASS ensure_rls re-applied"; else log "FAIL ensure_rls still absent after re-apply — the RLS defence-in-depth net is missing."; fail=1; fi
  else
    log "FAIL ensure_rls event trigger absent and migration file not found — cannot restore the RLS net."; fail=1
  fi
fi

# The dump-time manifest is REQUIRED: without it there is no independent record
# of what the snapshot should contain, so a silently-truncated restore could
# pass. A missing/unusable manifest is a FAIL, not a skip.
if [ ! -s "$WORK/counts.txt" ] || grep -q 'psql-unavailable' "$WORK/counts.txt"; then
  log "FAIL dump-time row-count manifest (counts.txt) is missing or was not generated — cannot prove the restore is complete."; fail=1
else
  log "Comparing row counts to the dump-time manifest"
  gen="$(psql "$TARGET" -Atqc "select string_agg(format('select %L as tbl, count(*) as n from %I.%I', schemaname||'.'||tablename, schemaname, tablename), ' union all ') from pg_tables where schemaname in ('public','auth','storage') and (schemaname||'.'||tablename) not in ('auth.schema_migrations','storage.migrations','storage.buckets_vectors','storage.vector_indexes')")"
  psql "$TARGET" -Atqc "$gen" | sort > "$WORK/restored-counts.txt"
  if diff "$WORK/counts.txt" "$WORK/restored-counts.txt" >/dev/null; then
    log "PASS row counts match the dump-time manifest exactly."
  else
    # A public.* mismatch is a hard FAIL (real data loss); auth/storage internal
    # diffs are surfaced but do not by themselves fail the drill.
    diff "$WORK/counts.txt" "$WORK/restored-counts.txt" > "$WORK/count-diff.txt" 2>&1 || true
    if grep -qE '^[<>].*[[:space:]]public\.' "$WORK/count-diff.txt"; then
      log "FAIL public.* row-count mismatch — data was lost or altered in the restore:"; cat "$WORK/count-diff.txt" >&2; fail=1
    else
      log "WARN non-public row-count differences (auth/storage internal — usually legitimate):"; cat "$WORK/count-diff.txt" >&2
    fi
  fi
fi

RLSV="$REPO/supabase/rls-verify.sql"
if [ ! -s "$RLSV" ]; then
  log "FAIL supabase/rls-verify.sql is missing — cannot verify RLS/containment on the restored DB."; fail=1
else
  log "Running supabase/rls-verify.sql"
  # Capture to a file first so a psql failure is unambiguous (a piped psql|grep
  # would hide psql's own exit status behind grep's).
  if ! psql "$TARGET" -f "$RLSV" > "$WORK/rls-verify.out" 2>"$WORK/rls-verify.err"; then
    log "FAIL rls-verify could not run (psql error):"; cat "$WORK/rls-verify.err" >&2; fail=1
  elif grep -iqE '\bFAIL\b' "$WORK/rls-verify.out"; then
    log "FAIL rls-verify reported FAIL rows — review RLS on the restored DB:"; grep -iE '\bFAIL\b' "$WORK/rls-verify.out" >&2; fail=1
  else
    log "PASS rls-verify: no FAIL rows."
  fi
fi

echo >&2
if [ "$fail" = 0 ]; then
  log "RESTORE DRILL PASSED. Scratch DB at $host holds a verified restore of the snapshot."
else
  die "RESTORE DRILL FAILED — see FAIL lines above. This snapshot is NOT proven restorable."
fi
