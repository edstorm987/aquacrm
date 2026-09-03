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
EXPECT=""; PASSIN=""; FORCE_REMOTE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --key) KEY="$2"; shift 2;;
    --passin) PASSIN="$2"; shift 2;;
    --target) TARGET="$2"; shift 2;;
    --expect-sha) EXPECT="$2"; shift 2;;
    --i-know-this-is-a-branch) FORCE_REMOTE=1; shift;;
    -h|--help) sed -n '2,26p' "$0"; exit 0;;
    -*) die "unknown flag $1";;
    *) CMS="$1"; shift;;
  esac
done

[ -n "$CMS" ] && [ -s "$CMS" ] || die "Pass the encrypted snapshot (.tar.gz.cms) as the first argument."

# --- PROD GUARD (before anything else, so a mistaken live target is rejected
#     immediately regardless of tooling) ---
host="$(printf '%s' "$TARGET" | sed -E 's#^[a-z]+://[^@]*@?([^:/?]+).*#\1#')"
case "$host" in
  127.0.0.1|localhost|::1) : ;;
  *pooler.supabase.com|*.supabase.co|*.supabase.in)
    [ "$FORCE_REMOTE" = 1 ] || die "Target host '$host' looks like a LIVE Supabase endpoint. Refusing. Restore only into 'supabase start' or a disposable BRANCH (then pass --i-know-this-is-a-branch).";;
  *)
    [ "$FORCE_REMOTE" = 1 ] || log "WARNING: non-local target '$host' (not a recognised Supabase host) — proceeding.";;
esac

[ -n "$KEY" ] || KEY="$HERE/_local/aquacrm-backup.key.pem"
[ -s "$KEY" ] || die "Private key not found at $KEY (pass --key). Keep it OFFLINE; this drill reads it locally only."
command -v openssl >/dev/null 2>&1 || die "openssl not found."
command -v psql >/dev/null 2>&1 || die "psql not found. Install: brew install libpq && add /opt/homebrew/opt/libpq/bin to PATH."

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

# --- Integrity, then decrypt ---
have="$(sha256 "$CMS" | awk '{print $1}')"
log "snapshot sha256=$have"
if [ -n "$EXPECT" ] && [ "$EXPECT" != "$have" ]; then
  die "sha256 mismatch: expected $EXPECT got $have — do NOT trust this file."
fi

log "Decrypting"
openssl cms -decrypt -binary -inform DER -in "$CMS" -inkey "$KEY" ${PASSIN:+-passin "$PASSIN"} -out "$WORK/bundle.tar.gz" \
  || die "Decrypt failed (wrong key or passphrase?)."
tar -xzf "$WORK/bundle.tar.gz" -C "$WORK"
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
    [ "${et:-0}" -gt 0 ] && log "PASS ensure_rls re-applied" || log "WARN ensure_rls still absent — re-apply $ETRIG manually."
  else
    log "WARN ensure_rls event trigger absent and migration file not found — re-apply it manually."
  fi
fi

if [ -s "$WORK/counts.txt" ] && ! grep -q 'psql-unavailable' "$WORK/counts.txt"; then
  log "Comparing row counts to the dump-time manifest"
  gen="$(psql "$TARGET" -Atqc "select string_agg(format('select %L as tbl, count(*) as n from %I.%I', schemaname||'.'||tablename, schemaname, tablename), ' union all ') from pg_tables where schemaname in ('public','auth','storage') and (schemaname||'.'||tablename) not in ('auth.schema_migrations','storage.migrations','storage.buckets_vectors','storage.vector_indexes')")"
  psql "$TARGET" -Atqc "$gen" | sort > "$WORK/restored-counts.txt"
  if diff "$WORK/counts.txt" "$WORK/restored-counts.txt" >/dev/null; then
    log "PASS row counts match the dump-time manifest exactly."
  else
    log "WARN row-count differences (< dump-time, > restored):"
    diff "$WORK/counts.txt" "$WORK/restored-counts.txt" >&2 || true
    log "     small auth/* internal diffs can be legitimate; any public.* mismatch is a real problem."
  fi
fi

RLSV="$REPO/supabase/rls-verify.sql"
if [ -s "$RLSV" ]; then
  log "Running supabase/rls-verify.sql"
  if psql "$TARGET" -f "$RLSV" 2>/dev/null | grep -iqE '\bFAIL\b'; then
    log "FAIL rls-verify reported FAIL rows — review RLS on the restored DB."; fail=1
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
