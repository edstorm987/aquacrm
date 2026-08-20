# `scripts/backfill-persons.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Backfill canonical `Person` and `Organisation` records from existing clients, leads and contacts, and link each facet back with `personId`.  The script GUESSES whether each record describes a human or a company and prints its reasoning. It does not act on a guess it is unsure about — ambiguous records are listed for a human decision instead. Read the dry-run output before applying.  Idempotent: matches existing records by facet first, then by normalised identity, so re-running never duplicates.  Dry run (default):  npx tsx scripts/backfill-persons.ts Apply:              npx tsx scripts/backfill-persons.ts --apply Include showcase:   npx tsx scripts/backfill-persons.ts --include-showcase  Showcase agencies are skipped by default: that data is fictional and gets wiped by resetAndSeedShowcaseWorkspace() anyway.  Respects whichever backend PORTAL_BACKEND selects. Run against the file sandbox first — a plain run with Supabase env present writes to the LIVE database. See docs/DEVELOPMENT-HANDOFF.md.

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

