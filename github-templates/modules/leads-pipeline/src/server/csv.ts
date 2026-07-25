// CSV parser — header autodetect + column-variant tolerance.
//
// Tiny purpose-built parser; no external dep. Handles:
//   - quoted fields with embedded commas
//   - escaped double-quotes inside quoted fields ("" → ")
//   - LF + CRLF line endings
//   - leading UTF-8 BOM
//   - empty trailing newline
//
// We deliberately do NOT support multi-line quoted fields — CSVs the
// agency uploads come from spreadsheets where Tab/Newline-in-field is
// rare and would otherwise complicate streaming. If a future round
// needs it, swap this for `papaparse` and keep the same return shape.

import { CSV_COLUMN_VARIANTS } from "../lib/domain";

export interface ParsedRow {
  rowNumber: number;               // 1-based source line, ignoring header
  email?: string;
  name?: string;
  phone?: string;
  company?: string;
  tags?: string[];
  source?: string;
  notes?: string;
  raw: string[];                   // raw cells, for error reporting
}

export interface ParseCsvResult {
  headerVariants: Record<string, number>; // canonical name → column index
  rows: ParsedRow[];
  unrecognisedHeaders: string[];
}

export function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else {
      if (c === ",") {
        out.push(cur);
        cur = "";
      } else if (c === '"' && cur.length === 0) {
        inQuotes = true;
      } else {
        cur += c;
      }
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

export function parseCsv(text: string): ParseCsvResult {
  const cleaned = stripBom(text).replace(/\r\n/g, "\n");
  const lines = cleaned.split("\n").filter(l => l.length > 0);
  if (lines.length === 0) {
    return { headerVariants: {}, rows: [], unrecognisedHeaders: [] };
  }
  const header = splitCsvLine(lines[0] ?? "").map(c => c.toLowerCase().trim());
  const headerVariants: Record<string, number> = {};
  const unrecognised: string[] = [];
  for (let i = 0; i < header.length; i++) {
    const key = header[i] ?? "";
    const canon = CSV_COLUMN_VARIANTS[key];
    if (canon) {
      // First match wins — re-uploads of the same CSV with duplicate
      // synonym columns shouldn't clobber the first.
      if (!(canon in headerVariants)) headerVariants[canon] = i;
    } else if (key.length > 0) {
      unrecognised.push(key);
    }
  }

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i] ?? "");
    const row: ParsedRow = { rowNumber: i, raw: cells };
    if ("email" in headerVariants) row.email = cells[headerVariants.email!]?.trim();
    if ("name" in headerVariants) row.name = cells[headerVariants.name!]?.trim();
    if ("phone" in headerVariants) row.phone = cells[headerVariants.phone!]?.trim();
    if ("company" in headerVariants) row.company = cells[headerVariants.company!]?.trim();
    if ("source" in headerVariants) row.source = cells[headerVariants.source!]?.trim();
    if ("notes" in headerVariants) row.notes = cells[headerVariants.notes!]?.trim();
    if ("tags" in headerVariants) {
      const raw = cells[headerVariants.tags!] ?? "";
      row.tags = raw.split(/[,;|]/).map(t => t.trim()).filter(Boolean);
    }
    rows.push(row);
  }
  return { headerVariants, rows, unrecognisedHeaders: unrecognised };
}
