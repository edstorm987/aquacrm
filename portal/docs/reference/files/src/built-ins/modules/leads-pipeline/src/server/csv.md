# `src/built-ins/modules/leads-pipeline/src/server/csv.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Spreadsheet text parser — header autodetect + column-variant tolerance.  Tiny purpose-built parser; no external dep. Handles CSV and TSV exports from spreadsheet tools: - quoted fields with embedded commas - escaped double-quotes inside quoted fields ("" → ") - tab-delimited rows exported/copied from sheets - LF + CRLF line endings - leading UTF-8 BOM - empty trailing newline - simple .xlsx first-sheet imports  We deliberately do NOT support multi-line quoted fields in text CSVs — CSVs the agency uploads come from spreadsheets where Tab/Newline-in-field is rare and would otherwise complicate streaming. If a future round needs it, swap this for `papaparse` and keep the same return shape.

## Exports (6)

- `interface ParsedRow (13 members)`
- `interface ParseCsvResult (4 members)`
- `stripBom(s: string): string`
- `splitCsvLine(line: string, delimiter: "," | "\t" | ";" = ","): string[]`
- `parseCsv(text: string): ParseCsvResult`
- `parseXlsxToDelimitedText(input: ArrayBuffer | Uint8Array | Buffer): string`

## Depends on (1)

- [`src/built-ins/modules/leads-pipeline/src/lib/domain.ts`](../lib/domain.md)

## Used by (5)

- [`scripts/smoke-scouting-niche.test.ts`](../../../../../../scripts/smoke-scouting-niche.test.md)
- [`src/built-ins/modules/leads-pipeline/src/__smoke__/leads-pipeline.test.ts`](../__smoke__/leads-pipeline.test.md)
- [`src/built-ins/modules/leads-pipeline/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/leads-pipeline/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/leads-pipeline/src/server/leads.ts`](./leads.md)

