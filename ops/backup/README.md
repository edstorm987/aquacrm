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

## Operational status — BUILT, NOT YET OPERATIONALLY VERIFIED

The code is complete and the whole pipeline was proven end-to-end on a local
`supabase start` stack (2026-09-03). It is **not operationally verified** — do not
rely on it for recovery — until every box below is ticked against the LIVE project:

- [ ] Owner generated the encryption keypair (`keygen.sh`).
- [ ] Only the **public** certificate is committed (the private key never leaves the owner).
- [ ] The private key has **at least two secure offline copies** (+ passphrase in a password manager).
- [ ] GitHub secrets configured (`SUPABASE_DB_URL`, `RESEND_API_KEY`, plus the destination and storage secrets below).
- [ ] A **durable, versioned, off-Supabase** destination is configured (`S3_*` object store with a lifecycle/retention policy).
- [ ] One real scheduled **or** manual backup **succeeds**.
- [ ] The delivered encrypted artifact is **downloaded**.
- [ ] That exact artifact is **restored** into an isolated target (`supabase start` / a branch).
- [ ] Restoration results are **verified and timed** (record the RTO here).
- [ ] Monitoring and **missed-backup alerts are exercised** (fail a run on purpose; confirm the alert fires).
- [ ] **Retention and deletion periods are defined** and enforced (see "Retention and deletion").

Until every box is ticked, the roadmap records recovery as *built but not
operationally verified*, and the scheduled workflow stays **inactive** (see
"Activating the schedule").

## This is NOT PITR — recovery point and recovery time

- **Not point-in-time.** Supabase PITR (declined, ~£200/mo) restores to any moment
  (~2-minute granularity). This system cannot.
- **Recovery Point Objective (RPO): up to ~24 h** — the schedule interval. A loss
  at 02:00 recovers to the previous 03:17 snapshot, losing up to a day of writes.
  A second daily `cron` line halves it to ~12 h; nothing here approaches PITR's ~2 min.
- **Recovery Time Objective (RTO): minutes to low tens of minutes** for a small
  database (download + decrypt + restore + verify) — but MEASURE it on the first
  real drill and record it here; it grows with data and storage-object volume.
- **Detection lag.** A failure/non-run is caught by the dead-man's-switch within
  its grace window (~3 h), so worst-case exposure ≈ RPO + grace.

## What it captures — and what it does NOT

Captured (fully restorable relational state):
- **roles** (`--role-only`)
- **schema** (tables, functions, RLS policies, grants, triggers)
- **data** for `public`, **`auth`**, and **`storage`** schemas.
  `auth` is essential: `public.profiles.id` references `auth.users(id)`, so a
  public-only dump would restore every login account as *gone* and orphan the CRM.

**Not** captured by the pg dump alone (but see "Storage object bytes" — the object
bytes ARE backed up when you configure the storage sync):
- **Storage object *bytes*.** The `storage` *metadata* rows are in the dump, but
  the uploaded files themselves (the private `aquacrm-uploads` bucket, plus the
  per-agency `*-uploads` buckets holding CVs, expense attachments, call recordings
  and inbox media) live in Supabase Storage, not Postgres. The optional storage
  sync below pulls those bytes into the encrypted bundle. **Metadata without the
  bytes is not a usable backup of uploaded files — enable the sync.**
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

7. **Do a restore drill** (below) before you trust it, and record the timing.

8. **Activate the schedule.** Only after 1–7 pass, add repo **Variable**
   `BACKUP_ENABLED` = `true`.

## Activating the schedule

The workflow ships **inactive on the schedule** on purpose: its job runs on a
`schedule` trigger only when the repo variable `BACKUP_ENABLED == 'true'`. Before
you set it, the nightly trigger is **skipped** (a neutral run, no red failures and
no false alerts) — this avoids a repo full of expected daily failures while the
keypair and secrets are still being set up. `workflow_dispatch` (manual) runs
**always** execute, which is how you test setup and run the first backup. Flip
`BACKUP_ENABLED` to `true` once the operational-verification checklist is green.

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

## Storage object bytes — backup and restore

The database dump holds Storage *metadata* only. To also capture the uploaded
**file bytes** (required for a usable restore of private buckets), configure the
storage sync. When set, `run.sh` runs `aws s3 sync` against the Supabase Storage
S3 endpoint for each named bucket and folds the objects into the **same encrypted,
versioned** snapshot as the database — so every daily snapshot is self-contained.

**Configure (GitHub → Settings → Secrets and variables → Actions):**

| Kind | Name | Value |
|---|---|---|
| Secret | `STORAGE_S3_ENDPOINT` | `https://<ref>.storage.supabase.co/storage/v1/s3` |
| Secret | `STORAGE_S3_ACCESS_KEY_ID` / `STORAGE_S3_SECRET_ACCESS_KEY` | a **dedicated** Storage S3 access key (Dashboard → Storage → S3 access keys) |
| Variable | `STORAGE_S3_REGION` | e.g. `eu-west-1` |
| Variable | `STORAGE_BUCKETS` | comma list of PRIVATE buckets, e.g. `aquacrm-uploads,aquaoasis-web-uploads,milesymedia-uploads,zimante-group-uploads` |

**Access controls are not weakened:** the buckets stay private; the sync uses a
dedicated backup S3 key (treat it as a secret; scope/rotate it); the bytes are
only ever written into the encrypted `.cms` envelope. Because the objects are in
the encrypted bundle, they inherit the same integrity hash and the same durable,
versioned destination — enabling storage backup effectively **requires** the
`S3_*` object-store destination (the snapshot will exceed the email limit and the
durability guard will insist on it).

**Restore the bytes** (after the DB restore, into a target that already has the
buckets from its own migrations — this does not change any policy or make anything
public):
```bash
# the drill leaves the decrypted bundle extracted; storage-objects/<bucket>/… holds the files
aws s3 sync ./storage-objects/aquacrm-uploads "s3://aquacrm-uploads" \
  --endpoint-url "https://<target-ref>.storage.supabase.co/storage/v1/s3" --region eu-west-1
```
Verify against `storage-manifest.txt` (the file list captured at backup time) and
the restored `storage.objects` metadata rows.

## Retention and deletion

Backups are customer data; keep them long enough to recover, not forever (GDPR
storage limitation). Enforce these on the **object store** with a lifecycle policy
(the durable copy), plus the notes for the other copies:

| Copy | Retention | Deletion |
|---|---|---|
| Object store (durable archive) | **GFS: 14 daily, 8 weekly, 12 monthly** | object-store lifecycle rule prunes past that; enable **object-lock/versioning** so a bad run can't erase history |
| GitHub run artifact (redundant) | 90 days | auto-expires (set in the workflow) |
| Emailed encrypted attachment (convenience) | your call | delete from the mailbox on the same cadence; do not treat the inbox as the archive |

Encryption keys and the DB password have their own lifecycle: rotate the DB
password and any storage/destination keys periodically; a **key rotation** means
generating a new keypair (old backups still need the OLD private key).

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
