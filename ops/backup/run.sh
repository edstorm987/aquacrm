#!/usr/bin/env bash
# AquaCRM self-managed database backup.
#
# Runs in GitHub Actions (see .github/workflows/db-backup.yml) OR locally on the
# owner's Mac. Produces ONE encrypted, self-describing snapshot of the Supabase
# Postgres database and delivers it to the owner. This is the compensating
# control for declining Supabase PITR: RPO = the schedule interval (~24h), NOT
# point-in-time. See ops/backup/README.md for the full runbook.
#
# Required env:
#   SUPABASE_DB_URL   Session-pooler connection string:
#                     postgresql://postgres.<ref>:<url-encoded-pw>@<host>.pooler.supabase.com:5432/postgres?sslmode=require
#                     NEVER the direct host db.<ref>.supabase.co (IPv6-only,
#                     unreachable from GitHub runners) and NEVER port 6543
#                     (transaction pooler — breaks pg_dump).
#
# Optional env (configure at least ONE durable off-GitHub copy — see the
# durability guard near the end):
#   RESEND_API_KEY        Resend key -> emails the snapshot (or a notification).
#   BACKUP_ALERT_EMAIL    Recipient (default: FOUNDER_EMAIL else edwardhallam07@gmail.com).
#   BACKUP_FROM_EMAIL     Verified Resend sender (default "AquaCRM Backups <enquiries@aqua-crm.com>").
#   S3_ENDPOINT S3_BUCKET S3_REGION AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
#                         Owner-controlled object store (Cloudflare R2 / Backblaze
#                         B2 / any S3). When set the snapshot is uploaded and
#                         READ-BACK-verified: the archive then lives off Supabase
#                         AND off GitHub. This is the recommended durable sink.
#   HC_PING_URL           healthchecks.io ping URL -> pinged only on success
#                         (dead-man's-switch; also catches non-execution).
set -euo pipefail

log() { printf '%s %s\n' "[$(date -u +%H:%M:%S)]" "$*" >&2; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is required (session-pooler connection string)}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT="${BACKUP_CERT:-$HERE/recipient.cert.pem}"   # BACKUP_CERT overrides for testing/advanced use
OUT="$HERE/_out"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT"

[ -s "$CERT" ] || die "Encryption cert $CERT is missing. Run ops/backup/keygen.sh once and commit ops/backup/recipient.cert.pem."
openssl x509 -in "$CERT" -noout -subject >/dev/null 2>&1 || die "Encryption cert $CERT is not a valid X.509 certificate."

# Mask the project ref + password so a libpq/Supavisor auth error can never
# print them (the whole-URL secret mask does not cover the bare 'postgres.<ref>'
# username that an auth failure echoes).
if [ -n "${GITHUB_ACTIONS:-}" ]; then
  ref="$(printf '%s' "$SUPABASE_DB_URL" | sed -E 's#.*postgres\.([a-z0-9]+):.*#\1#')"
  pw="$(printf '%s' "$SUPABASE_DB_URL" | sed -E 's#.*postgres\.[a-z0-9]+:([^@]*)@.*#\1#')"
  [ -n "$ref" ] && [ "$ref" != "$SUPABASE_DB_URL" ] && printf '::add-mask::%s\n' "$ref"
  [ -n "$pw" ] && [ "$pw" != "$SUPABASE_DB_URL" ] && printf '::add-mask::%s\n' "$pw"
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BASE="aquacrm-$STAMP"

# --- Preflight + row-count manifest (needs psql; degrades cleanly without it) ---
if command -v psql >/dev/null 2>&1; then
  log "Preflight: SELECT 1"
  psql "$SUPABASE_DB_URL" -Atqc 'select 1' >/dev/null \
    || die "Cannot connect with SUPABASE_DB_URL. Check: host aws-0 vs aws-1 (copy exact from Dashboard -> Connect -> Session pooler), port 5432 (not 6543), user postgres.<ref> (not bare postgres), sslmode=require, url-encoded password."
  log "Capturing row-count manifest (public, auth, storage)"
  gen="$(psql "$SUPABASE_DB_URL" -Atqc "select string_agg(format('select %L as tbl, count(*) as n from %I.%I', schemaname||'.'||tablename, schemaname, tablename), ' union all ') from pg_tables where schemaname in ('public','auth','storage') and (schemaname||'.'||tablename) not in ('auth.schema_migrations','storage.migrations','storage.buckets_vectors','storage.vector_indexes')")"
  psql "$SUPABASE_DB_URL" -Atqc "$gen" | sort > "$WORK/counts.txt" || die "Row-count manifest query failed."
else
  log "psql not found -> skipping preflight and row-count manifest (the dump itself still runs)."
  echo "psql-unavailable-at-dump-time" > "$WORK/counts.txt"
fi

# --- Dumps: Supabase-aware. roles + schema + data. The data dump MUST include
#     public,auth,storage: public.profiles.id references auth.users(id); a
#     public-only data dump restores every login account as gone. ---
log "Dumping roles"
supabase db dump --db-url "$SUPABASE_DB_URL" -f "$WORK/roles.sql" --role-only --yes
log "Dumping schema"
supabase db dump --db-url "$SUPABASE_DB_URL" -f "$WORK/schema.sql" --yes
log "Dumping data (public, auth, storage)"
# Exclude platform catalog tables: they are migration/vector tracking (never user
# data), a restore target already has them, and the restricted 'postgres' role
# cannot truncate them — so including them would collide on restore.
DATA_EXCLUDE="auth.schema_migrations,storage.migrations,storage.buckets_vectors,storage.vector_indexes"
supabase db dump --db-url "$SUPABASE_DB_URL" -f "$WORK/data.sql" --data-only --use-copy --schema public,auth,storage -x "$DATA_EXCLUDE" --yes

for f in roles.sql schema.sql data.sql; do [ -s "$WORK/$f" ] || die "$f is empty — dump failed."; done

# --- Manifest + bundle ---
{
  echo "project: aquacrm"
  echo "utc: $STAMP"
  echo "supabase_cli: $(supabase --version 2>/dev/null | head -1)"
  echo "openssl: $(openssl version)"
  echo "scope: roles + schema(default non-system) + data(public,auth,storage)."
  echo "note: Storage object BINARIES are NOT in this dump (relational metadata only) — see README."
  echo "note: cluster-level event triggers (ensure_rls) may be omitted by scoped dumps — restore-drill re-applies from migrations."
  echo "sha256:"
  ( cd "$WORK" && sha256 roles.sql schema.sql data.sql counts.txt )
} > "$WORK/MANIFEST.txt"

tar -czf "$WORK/$BASE.tar.gz" -C "$WORK" roles.sql schema.sql data.sql counts.txt MANIFEST.txt
log "Bundle: $(du -h "$WORK/$BASE.tar.gz" | cut -f1)"

# --- Encrypt: hybrid public-key (CMS). CI holds only the public cert, so nothing
#     in CI can decrypt a backup; only the offline private key can. ---
CMS="$OUT/$BASE.tar.gz.cms"
openssl cms -encrypt -aes-256-cbc -binary -in "$WORK/$BASE.tar.gz" -outform DER -out "$CMS" "$CERT"
openssl cms -cmsout -noout -inform DER -in "$CMS" || die "Encrypted envelope failed to parse."
SHA="$(sha256 "$CMS" | awk '{print $1}')"
SIZE="$(wc -c < "$CMS" | tr -d ' ')"
log "Encrypted: $CMS ($SIZE bytes) sha256=$SHA"

# Destroy the plaintext dumps immediately.
rm -f "$WORK"/roles.sql "$WORK"/schema.sql "$WORK"/data.sql "$WORK"/counts.txt "$WORK"/MANIFEST.txt "$WORK/$BASE.tar.gz"

# Publish the integrity hash on a channel independent of the emailed attachment
# (tamper-evidence: forging a backup then requires compromising BOTH the mailbox
# and the GitHub run summary).
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### AquaCRM backup $STAMP"
    echo "- file: \`$BASE.tar.gz.cms\`"
    echo "- size: $SIZE bytes"
    echo "- sha256(.cms): \`$SHA\`"
  } >> "$GITHUB_STEP_SUMMARY"
fi

# --- Delivery ---
delivered_durable=0   # a copy that survives independently of the GitHub artifact

# (1) Object store — durable, off-Supabase AND off-GitHub — when configured.
if [ -n "${S3_BUCKET:-}" ] && [ -n "${S3_ENDPOINT:-}" ]; then
  command -v aws >/dev/null 2>&1 || die "S3_* is configured but the aws CLI is not installed."
  key="backups/$BASE.tar.gz.cms"
  log "Uploading to object store s3://$S3_BUCKET/$key"
  aws s3 cp "$CMS" "s3://$S3_BUCKET/$key" --endpoint-url "$S3_ENDPOINT" ${S3_REGION:+--region "$S3_REGION"} --only-show-errors
  remote="$(aws s3 cp "s3://$S3_BUCKET/$key" - --endpoint-url "$S3_ENDPOINT" ${S3_REGION:+--region "$S3_REGION"} | sha256 | awk '{print $1}')"
  [ "$remote" = "$SHA" ] || die "Object-store upload verify FAILED (local $SHA != remote $remote)."
  log "Object-store copy verified."
  delivered_durable=1
fi

# (2) Email via Resend — attach the ciphertext when small enough, else notify.
if [ -n "${RESEND_API_KEY:-}" ]; then
  if ! command -v jq >/dev/null 2>&1; then
    log "WARNING: RESEND_API_KEY is set but jq is not installed — skipping email."
  else
    to="${BACKUP_ALERT_EMAIL:-${FOUNDER_EMAIL:-edwardhallam07@gmail.com}}"
    from="${BACKUP_FROM_EMAIL:-AquaCRM Backups <enquiries@aqua-crm.com>}"
    run_url="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-edstorm987/aquacrm}/actions/runs/${GITHUB_RUN_ID:-local}"
    b64bytes="$(base64 < "$CMS" | tr -d '\n' | wc -c | tr -d ' ')"
    umask 077; cfg="$WORK/curlcfg"; printf 'header = "Authorization: Bearer %s"\n' "$RESEND_API_KEY" > "$cfg"
    if [ "$b64bytes" -le 20000000 ]; then
      log "Emailing encrypted snapshot as attachment ($b64bytes base64 bytes)"
      b64="$(base64 < "$CMS" | tr -d '\n')"
      jq -n --arg to "$to" --arg from "$from" \
        --arg subj "AquaCRM backup $STAMP (sha256 ${SHA:0:16})" \
        --arg body "Encrypted database snapshot attached. sha256(.cms)=$SHA size=$SIZE bytes. Decrypt on your Mac: openssl cms -decrypt -binary -inform DER -in $BASE.tar.gz.cms -inkey aquacrm-backup.key.pem -out $BASE.tar.gz  (then tar -xzf). Full steps: ops/backup/README.md. Run: $run_url" \
        --arg fn "$BASE.tar.gz.cms" --arg c "$b64" \
        '{from:$from,to:[$to],subject:$subj,text:$body,attachments:[{filename:$fn,content:$c}]}' > "$WORK/payload.json"
      curl -fsS --retry 3 --config "$cfg" -X POST https://api.resend.com/emails -H "Content-Type: application/json" -d @"$WORK/payload.json" >/dev/null \
        && { log "Email sent (with attachment)."; delivered_durable=1; } \
        || die "Resend send failed."
    elif [ "$delivered_durable" = 1 ]; then
      # Too large to attach, but the object store already holds a verified copy.
      log "Snapshot too large to attach ($b64bytes base64 bytes) -> notification only (durable copy is in the object store)."
      jq -n --arg to "$to" --arg from "$from" \
        --arg subj "AquaCRM backup $STAMP (notification only — too large to attach)" \
        --arg body "Encrypted snapshot $BASE.tar.gz.cms size=$SIZE bytes sha256=$SHA. Too large to email; retrieve it from the object store. Run: $run_url" \
        '{from:$from,to:[$to],subject:$subj,text:$body}' > "$WORK/payload.json"
      curl -fsS --retry 3 --config "$cfg" -X POST https://api.resend.com/emails -H "Content-Type: application/json" -d @"$WORK/payload.json" >/dev/null \
        && log "Notification email sent." || die "Resend send failed."
    else
      # Too large to attach AND no durable copy — do not send a misleading email;
      # the durability guard below fails the run with an actionable message.
      log "Snapshot too large to attach ($b64bytes base64 bytes) and no object store configured."
    fi
    rm -f "$cfg"
  fi
fi

# (3) Durability guarantee: never let the ONLY copy be the expiring GitHub
#     artifact (same vendor as the runner, 90-day retention). Fail loudly.
if [ "$delivered_durable" = 0 ]; then
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    die "No durable off-GitHub copy was made: object store not configured and the snapshot was not emailed (too large, or RESEND/jq missing). The GitHub artifact alone expires. Configure S3_* (recommended) or keep the snapshot under the email limit."
  else
    log "WARNING: no object store / email configured — the encrypted snapshot exists only locally at $CMS."
  fi
fi

# (4) Dead-man's-switch — ping ONLY on success.
if [ -n "${HC_PING_URL:-}" ]; then
  curl -fsS -m 10 --retry 5 "$HC_PING_URL" >/dev/null 2>&1 && log "Heartbeat pinged." || log "WARNING: heartbeat ping failed."
fi

log "Backup complete: $BASE.tar.gz.cms"
