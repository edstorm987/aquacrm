#!/usr/bin/env bash
# Containment isolation harness — LOCAL ONLY.
#
# Boots nothing itself: expects `supabase start` already running (Docker).
# Resets the LOCAL database (destructive to local data only), which applies
# the full migration chain including 20260908210000_assume_breach_containment
# — whose self-verification DO block is the first gate — then runs the
# two-tenant PostgREST + Storage negative/positive suite against the local
# stack. It never reads DATABASE_URL and cannot touch a remote project.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "── local stack status"
supabase status >/dev/null || { echo "supabase local stack is not running — run 'supabase start' first"; exit 2; }

echo "── db reset (applies full chain incl. containment migration; LOCAL ONLY)"
supabase db reset --local

echo "── extracting local keys"
eval "$(supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
export SUPABASE_LOCAL_URL="${API_URL}"
export SUPABASE_LOCAL_ANON_KEY="${ANON_KEY}"
export SUPABASE_LOCAL_SERVICE_KEY="${SERVICE_ROLE_KEY}"

echo "── running containment isolation tests"
node --test tests/containment-isolation.test.mjs
