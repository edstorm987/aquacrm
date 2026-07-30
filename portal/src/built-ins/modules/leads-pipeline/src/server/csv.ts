// Spreadsheet text parser — header autodetect + column-variant tolerance.
//
// Tiny purpose-built parser; no external dep. Handles CSV and TSV
// exports from spreadsheet tools:
//   - quoted fields with embedded commas
//   - escaped double-quotes inside quoted fields ("" → ")
//   - tab-delimited rows exported/copied from sheets
//   - LF + CRLF line endings
//   - leading UTF-8 BOM
//   - empty trailing newline
//   - simple .xlsx first-sheet imports
//
// We deliberately do NOT support multi-line quoted fields in text CSVs — CSVs the
// agency uploads come from spreadsheets where Tab/Newline-in-field is
// rare and would otherwise complicate streaming. If a future round
// needs it, swap this for `papaparse` and keep the same return shape.

import { inflateRawSync } from "node:zlib";
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
  headers: string[];
  headerVariants: Record<string, number>; // canonical name → column index
  rows: ParsedRow[];
  unrecognisedHeaders: string[];
}

export function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function detectDelimiter(headerLine: string): "," | "\t" | ";" {
  const tabs = countDelimiterOutsideQuotes(headerLine, "\t");
  const commas = countDelimiterOutsideQuotes(headerLine, ",");
  const semicolons = countDelimiterOutsideQuotes(headerLine, ";");
  if (tabs >= commas && tabs >= semicolons && tabs > 0) return "\t";
  if (semicolons > commas && semicolons > 0) return ";";
  return ",";
}

function countDelimiterOutsideQuotes(line: string, delimiter: "," | "\t" | ";"): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && line[i + 1] === '"') {
      i++;
    } else if (c === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && c === delimiter) {
      count++;
    }
  }
  return count;
}

export function splitCsvLine(line: string, delimiter: "," | "\t" | ";" = ","): string[] {
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
      if (c === delimiter) {
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
    return { headers: [], headerVariants: {}, rows: [], unrecognisedHeaders: [] };
  }
  const delimiter = detectDelimiter(lines[0] ?? "");
  const headers = splitCsvLine(lines[0] ?? "", delimiter).map(c => c.trim());
  const header = headers.map(c => c.toLowerCase());
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
    const cells = splitCsvLine(lines[i] ?? "", delimiter);
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
  return { headers, headerVariants, rows, unrecognisedHeaders: unrecognised };
}

export function parseXlsxToDelimitedText(input: ArrayBuffer | Uint8Array | Buffer): string {
  const zip = readZip(input);
  const workbookXml = readZipText(zip, "xl/workbook.xml");
  const relsXml = readZipText(zip, "xl/_rels/workbook.xml.rels");
  const firstSheetRelId = matchAttr(workbookXml, /<sheet\b[^>]*\br:id="([^"]+)"/);
  if (!firstSheetRelId) throw new Error("xlsx_missing_first_sheet");
  const sheetTarget = findRelationshipTarget(relsXml, firstSheetRelId);
  if (!sheetTarget) throw new Error("xlsx_missing_sheet_relationship");
  const sheetPath = resolveWorkbookTarget(sheetTarget);
  const sharedStrings = parseSharedStrings(zip.get("xl/sharedStrings.xml")?.toString("utf8") ?? "");
  const sheetXml = readZipText(zip, sheetPath);
  const rows = parseSheetRows(sheetXml, sharedStrings);
  return rows.map(row => row.map(cell => escapeDelimitedCell(cell)).join("\t")).join("\n");
}

function readZip(input: ArrayBuffer | Uint8Array | Buffer): Map<string, Buffer> {
  const buf = Buffer.isBuffer(input)
    ? input
    : input instanceof Uint8Array
      ? Buffer.from(input.buffer, input.byteOffset, input.byteLength)
      : Buffer.from(input);
  const eocd = findEndOfCentralDirectory(buf);
  const entryCount = buf.readUInt16LE(eocd + 10);
  const centralOffset = buf.readUInt32LE(eocd + 16);
  const entries = new Map<string, Buffer>();
  let offset = centralOffset;

  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) throw new Error("xlsx_bad_central_directory");
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    entries.set(name, readLocalZipEntry(buf, localOffset, compressedSize, method));
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(buf: Buffer): number {
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error("xlsx_bad_zip");
}

function readLocalZipEntry(buf: Buffer, offset: number, compressedSize: number, method: number): Buffer {
  if (buf.readUInt32LE(offset) !== 0x04034b50) throw new Error("xlsx_bad_local_file");
  const nameLength = buf.readUInt16LE(offset + 26);
  const extraLength = buf.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + nameLength + extraLength;
  const compressed = buf.subarray(dataStart, dataStart + compressedSize);
  if (method === 0) return compressed;
  if (method === 8) return inflateRawSync(compressed);
  throw new Error(`xlsx_unsupported_zip_compression_${method}`);
}

function readZipText(zip: Map<string, Buffer>, path: string): string {
  const entry = zip.get(path);
  if (!entry) throw new Error(`xlsx_missing_${path}`);
  return entry.toString("utf8");
}

function findRelationshipTarget(relsXml: string, id: string): string | null {
  const escaped = escapeRegExp(id);
  const re = new RegExp(`<Relationship\\b[^>]*\\bId="${escaped}"[^>]*\\bTarget="([^"]+)"[^>]*/?>`);
  return matchAttr(relsXml, re);
}

function resolveWorkbookTarget(target: string): string {
  const clean = target.replace(/^\/+/, "");
  if (clean.startsWith("xl/")) return clean;
  return `xl/${clean}`;
}

function parseSharedStrings(xml: string): string[] {
  if (!xml) return [];
  const values: string[] = [];
  for (const si of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    values.push(extractTextRuns(si[1] ?? ""));
  }
  return values;
}

function parseSheetRows(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cellMatch of (rowMatch[1] ?? "").matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1] ?? "";
      const body = cellMatch[2] ?? "";
      const ref = matchAttr(attrs, /\br="([A-Z]+)\d+"/);
      const columnIndex = ref ? columnNameToIndex(ref) : row.length;
      while (row.length < columnIndex) row.push("");
      row[columnIndex] = parseCellValue(attrs, body, sharedStrings);
    }
    rows.push(row);
  }
  return rows;
}

function parseCellValue(attrs: string, body: string, sharedStrings: string[]): string {
  const type = matchAttr(attrs, /\bt="([^"]+)"/);
  if (type === "inlineStr") return extractTextRuns(body);
  const value = matchAttr(body, /<v[^>]*>([\s\S]*?)<\/v>/) ?? "";
  if (type === "s") return sharedStrings[Number(value)] ?? "";
  if (type === "str") return decodeXml(value);
  return decodeXml(value);
}

function extractTextRuns(xml: string): string {
  const textRuns = [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(match => decodeXml(match[1] ?? ""));
  return textRuns.join("");
}

function columnNameToIndex(name: string): number {
  let index = 0;
  for (const char of name) index = index * 26 + char.charCodeAt(0) - 64;
  return index - 1;
}

function escapeDelimitedCell(value: string): string {
  return value.replace(/\t/g, " ").replace(/\r?\n/g, " ").trim();
}

function matchAttr(text: string, pattern: RegExp): string | null {
  return pattern.exec(text)?.[1] ?? null;
}

function decodeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
