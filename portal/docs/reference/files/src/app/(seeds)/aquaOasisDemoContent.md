# `src/app/(seeds)/aquaOasisDemoContent.ts`

← [File index](../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** T4 R004 — AquaOasis Demo content pack  Seeds demo data INTO the AquaOasis Demo agency that T1 R026 (chapter #133) provisioned. T1's `lib/server/aquaOasisSeed.ts` creates the agency record + brand kit + plugin installs. THIS module fills those installs with realistic-looking demo data so when Ed flips the Topbar agency switcher to AquaOasis, the plugin pages aren't empty.  Placed under `src/app/(seeds)/` rather than `src/lib/server/` because the latter is T1 territory (router HARD BOUNDARY). The (seeds) route group means Next.js does NOT route this folder — it's a code-only container we own.  Wire-up: Q-ASSUMED — T1 will import `seedAquaOasisDemoContent` and call it from `aquaOasisSeed.ts` (or founder seed runner) AFTER the agency record + plugin installs land. Module is pure data + a port-driven runner, so T1 wires storage adapters into `ports`. Idempotent via the `aquaoasis-demo-content/seeded` metadata flag — caller passes a `markerStore` port that T1 maps to whatever install-metadata or agency-metadata bag they prefer.  Honesty contract (chapter #68): every record carries a clearly marked DEMO-* slug + `demo: true` flag so no number can be confused with real client data downstream.  Feature flag: `seedAquaOasisContent` defaults to `true` outside production; in production the demo content stays out of the seeded agency record (so a prod tenant flip doesn't spawn fake data).

## Exports (18)

- `AQUA_OASIS_AGENCY_SLUG`
- `AQUA_OASIS_DEMO_MARKER_KEY`
- `seedAquaOasisContent: boolean`
- `interface DemoBrandKit (8 members)`
- `DEMO_BRAND_KITS: readonly DemoBrandKit[]`
- `interface DemoClient (5 members)`
- `DEMO_CLIENTS: readonly DemoClient[]`
- `interface DemoContact (6 members)`
- `DEMO_CONTACTS: readonly DemoContact[]`
- `interface DemoBooking (7 members)`
- `DEMO_BOOKINGS: readonly DemoBooking[]`
- `interface DemoLead (6 members)`
- `DEMO_LEADS: readonly DemoLead[]`
- `interface DemoAgencyCampaign (6 members)`
- `DEMO_AGENCY_CAMPAIGNS: readonly DemoAgencyCampaign[]`
- `interface SeedPorts (6 members)`
- `interface SeedResult (2 members)`
- `async seedAquaOasisDemoContent(ports: SeedPorts): Promise<SeedResult>`

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

