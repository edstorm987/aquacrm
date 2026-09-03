# AquaCRM self-managed database backup

A scheduled, **encrypted, off-Supabase** snapshot of the production Postgres
database, delivered to the owner. This is the **compensating control** for
declining Supabase Point-in-Time Recovery (PITR, ~£200/mo).

**Be honest about what this is.** Recovery Point Objective (RPO) = the schedule
interval, currently **~24 hours**. If the database is lost at 03:00, you recover
to the previous night's snapshot and lose up to a day of writes. PITR's RPO is
near-zero (~2 min). This is a real, tested, cheap safety net — not an equivalent
to PITR. It runs *alongside* Supabase's own daily physical backups (which you
can only restore via the dashboard/support); this one gives you a copy **you
hold**, off Supabase, that you can restore anywhere.

## What it captures — and what it does NOT

Captured (fully restorable relational state):
- **roles** (`--role-only`)
- **schema** (tables, functions, RLS policies, grants, triggers)
- **data** for `public`, **`auth`**, and **`storage`** schemas.
  `auth` is essential: `public.profiles.id` references `auth.users(id)`, so a
  public-only dump would restore every login account as *gone* and orphan the CRM.

**Not** captured (know these gaps):
- **Storage object *binaries*.** The `storage` *metadata* rows are dumped, but
  the uploaded files themselves (e.g. the `aquacrm-uploads` bucket) live in
  object storage, not Postgres. If you rely on stored files, add a separate
  `rclone`/S3 sync of the buckets (see "Optional: Storage binaries" below).
- **Role *passwords*** (pg dumps roles without passwords — expected).
- Four **platform catalog tables** are excluded from the data dump on purpose —
  `auth.schema_migrations`, `storage.migrations`, `storage.buckets_vectors`,
  `storage.vector_indexes`. They are migration/vector tracking (never your data),
  the restore target already has them from its own migrations, and the restricted
  `postgres` role can't even truncate them — so including them would collide on
  restore.
- Cluster-level **event triggers** (`ensure_rls`) are omitted by a schema-scoped
  dump. The restore drill detects this and **re-applies it automatically** from
  `supabase/migrations/20260903130000_ensure_rls_event_trigger.sql`.

## Files

| File | Role |
|---|---|
| `keygen.sh` | One-time: make the RSA-4096 backup keypair. |
| `recipient.cert.pem` | **Public** cert CI encrypts to. Committed. Created by `keygen.sh` (not in the repo until you run it). |
| `run.sh` | Dump → bundle → encrypt → deliver. Runs in CI and locally. |
| `restore-drill.sh` | Decrypt → restore into a scratch DB → verify. Proves a backup. |
| `../../.github/workflows/db-backup.yml` | Daily schedule + manual trigger. |
| `_local/` | Your private key lives here (gitignored). Move it offline. |
| `_out/` | Encrypted snapshots written locally (gitignored). |

## One-time setup

1. **Generate the keypair** (on your Mac):
   ```bash
   bash ops/backup/keygen.sh
   ```
   - Choose a strong passphrase and **save it in your password manager now** —
     it cannot be recovered.
   - Move `ops/backup/_local/aquacrm-backup.key.pem` into your password
     manager / an encrypted volume, and keep an offline copy. Losing the key or
     passphrase makes **every** backup permanently unreadable.
   - Commit the public cert only:
     ```bash
     git add ops/backup/recipient.cert.pem && git commit -m "Add backup encryption cert"
     ```

2. **Get the session-pooler connection string.** Supabase Dashboard →
   **Connect** → **Session pooler**. It looks like:
   ```
   postgresql://postgres.<ref>:<PASSWORD>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
   ```
   - **Copy the host verbatim** — newer eu-west-1 projects are `aws-1-…`, not `aws-0-…`.
   - Port **must** be `5432` (session), never `6543` (transaction — breaks dumps).
   - User **must** be the tenant form `postgres.<ref>`, never bare `postgres`.
   - **URL-encode** the password if it has special characters.
   - Append `?sslmode=require`.
   - This URL contains the DB password — treat it as a secret.

3. **Add GitHub Actions secrets** (repo → Settings → Secrets and variables → Actions):

   | Secret | Required | Value |
   |---|---|---|
   | `SUPABASE_DB_URL` | ✅ | the full session-pooler URL from step 2 |
   | `RESEND_API_KEY` | ✅ (for email delivery) | your Resend key |
   | `BACKUP_ALERT_EMAIL` | optional | recipient (default `edwardhallam07@gmail.com`) |
   | `S3_ENDPOINT`, `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | recommended | owner-controlled object store (R2/B2/S3) — the durable archive |
   | `HC_PING_URL` | recommended | healthchecks.io ping URL (dead-man's-switch) |

   Repo → Settings → Secrets and variables → Actions → **Variables**:
   | Variable | Value |
   |---|---|
   | `BACKUP_FROM_EMAIL` | e.g. `AquaCRM Backups <enquiries@aqua-crm.com>` (domain must be Resend-verified) |
   | `S3_REGION` | e.g. `eu-west-1` (if using an object store) |

4. **Confirm the repo is private.** These backups and the workflow assume a
   private repo. Do not make it public.

5. **Set up the dead-man's-switch (strongly recommended).** Create one free
   [healthchecks.io](https://healthchecks.io) check: period 1 day, grace 3h,
   email alert to yourself. Put its ping URL in `HC_PING_URL`. `run.sh` pings it
   **only on success**, so you're alerted if a backup fails *or never runs*
   (job failure, cron drop, or the 60-day auto-disable below). A "success email
   that didn't arrive" is not a reliable alarm; this is.

6. **Run the first backup manually.** Actions → *aquacrm-backup* → **Run
   workflow**. Confirm the encrypted snapshot arrives by email and the run
   summary shows the sha256.

7. **Do a restore drill** (below) before you trust it.

## Restoring / proving a backup

Never restore into production. Restore into a local `supabase start` database or
a disposable branch. The drill refuses live Supabase hosts by default.

```bash
# 1. bring up a scratch Postgres (ships auth/storage/roles/extensions)
supabase start

# 2. install psql 17 if needed
brew install libpq && export PATH="/opt/homebrew/opt/libpq/bin:$PATH"

# 3. decrypt + restore + verify (key passphrase prompted)
bash ops/backup/restore-drill.sh /path/to/aquacrm-YYYYMMDD….tar.gz.cms
```

The drill: verifies the sha256, decrypts, strips the ownership/role lines that
would abort a single-transaction restore, **prepares the scratch target** (drops
`public`, clears `auth`/`storage` data so the snapshot loads into a clean slate),
applies `roles` best-effort, then restores `schema → data` in one strict
transaction with `session_replication_role = replica`. It then asserts
`auth.users > 0`, compares per-table row counts to the dump-time manifest,
re-applies the `ensure_rls` event trigger if the scoped dump omitted it, and runs
`supabase/rls-verify.sql`. It exits non-zero if the snapshot is not provably
restorable.

> This whole pipeline — dump (with the auth/storage scope and the four platform
> excludes), CMS encrypt, decrypt, sanitise, target-prep, restore, and every
> verification tripwire — was proven end-to-end against a local `supabase start`
> stack on 2026-09-03 before first use.

To decrypt a snapshot by hand (e.g. from an email attachment):
```bash
openssl cms -decrypt -binary -inform DER \
  -in aquacrm-….tar.gz.cms -inkey aquacrm-backup.key.pem -out aquacrm-….tar.gz
tar -xzf aquacrm-….tar.gz
```

## Security model

- **Public-key (hybrid) encryption.** CI holds only `recipient.cert.pem`. A full
  compromise of GitHub secrets or the runner still cannot decrypt a backup —
  only your offline private key can.
- **AES-256-CBC is confidentiality, not authenticity.** Integrity rests on the
  SHA-256, which is published on **two** channels (the email *and* the GitHub run
  summary). Before trusting a restore, confirm the two hashes match. Forging a
  backup would require compromising both channels. (Proven on this repo's
  LibreSSL: a flipped ciphertext byte fails to decrypt.)
- **Secrets never printed.** `run.sh` runs without `set -x`, masks the project
  ref and password, and keeps the Resend token out of `curl` argv via a config
  file. Plaintext dumps are shredded in-job.
- **`.gitignore`** blocks the private key and any dump from ever being committed.
  Only ever `git add ops/backup/recipient.cert.pem` — never `git add -A` from
  this directory after a drill.

## Optional: Storage object binaries

If uploaded files matter, add a bucket sync (creds as GitHub secrets) and include
the output in the tarball, e.g.:
```bash
rclone sync :s3:aquacrm-uploads ./storage-objects \
  --s3-endpoint "https://<ref>.storage.supabase.co/storage/v1/s3" --s3-region eu-west-1
```

## Residual risks (accept or mitigate)

- **60-day auto-disable.** GitHub disables a scheduled workflow after 60 days
  with no repo commits (private repos included). This repo is actively
  developed, so it's low-risk today — but the healthchecks dead-man's-switch is
  what actually catches it. To be bulletproof, trigger the job from an external
  scheduler via `repository_dispatch` instead of `schedule`.
- **Email size.** Above ~14 MB of ciphertext the snapshot can't be emailed. If
  no object store is configured, the run **fails loudly** rather than silently
  leaving only the expiring GitHub artifact — that's your cue to set up `S3_*`.
- **Key loss = total loss.** No key, no recovery. Keep the private key and
  passphrase backed up offline in at least two places.
- **RPO ~24h.** Halve it with a second `cron` line; it will never approach PITR.
