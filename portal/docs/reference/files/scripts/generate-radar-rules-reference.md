# `scripts/generate-radar-rules-reference.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Generates the COMPLETE enumeration of every Radar rule (all 2,052) straight from the source-of-truth catalogue, so nothing is left implicit. Run under tsx:  npx tsx scripts/generate-radar-rules-reference.ts  Writes docs/reference/radar-rules.md — every rule id, grouped domain → family, with what each lens checks. Re-run after editing radarRuleCatalog.ts.

_No exported symbols (side-effect / internal module)._

## Depends on (1)

- [`src/engines/data/radar/radarRuleCatalog.ts`](../src/engines/data/radar/radarRuleCatalog.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

