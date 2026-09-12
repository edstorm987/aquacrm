"use client";

import { useRef, useState, type FormEvent } from "react";
import { FileSpreadsheet, SlidersHorizontal, Upload, X } from "lucide-react";
import { useFocusTrap } from "@/lib/a11y/useFocusTrap";

type ImportPreview = {
  filename: string;
  headers: string[];
  rowCount: number;
  samples: string[][];
};

const PROSPECT_FIELDS = [
  ["company", "Business name"],
  ["name", "Person"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["website", "Website"],
  ["address", "Address"],
  ["googleMapsUrl", "Google Maps URL"],
  ["niche", "Niche"],
  ["tags", "Tags"],
  ["source", "Source"],
  ["notes", "Notes"],
] as const;

const TEMPLATE = [
  "business_name,contact_name,email,phone,website,address,google_maps_url,niche,tags,notes",
  "Example Ltd,Jane Smith,jane@example.com,07123456789,https://example.com,Stafford,https://maps.google.com/example,plumber,claffy;local,Needs research",
].join("\n");

export function ProspectImportDialog({ onClose, onImported }: { onClose: () => void; onImported: (message: string) => void }) {
  const dialogRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [defaultSource, setDefaultSource] = useState("claffy-import");
  const [defaultNiche, setDefaultNiche] = useState("");
  const [defaultTags, setDefaultTags] = useState("claffy, imported");
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  useFocusTrap(dialogRef, true, { onEscape: busy ? undefined : onClose });

  function setColumnMapping(index: number, target: string) {
    setMapping(current => {
      const next = { ...current };
      if (target !== "skip") {
        for (const [otherIndex, otherTarget] of Object.entries(next)) {
          if (otherIndex !== String(index) && otherTarget === target) next[otherIndex] = "skip";
        }
      }
      next[String(index)] = target;
      return next;
    });
  }

  async function previewFile(file?: File) {
    if (!file) {
      setPreview(null);
      setMapping({});
      return;
    }
    setBusy("preview");
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/portal/leads-pipeline/import-csv/preview", { method: "POST", body: form });
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        error?: string;
        filename?: string;
        headers?: string[];
        rowCount?: number;
        samples?: string[][];
        guessedMapping?: Record<string, string>;
      } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error ?? "Could not read this spreadsheet.");
      setPreview({
        filename: payload.filename ?? file.name,
        headers: payload.headers ?? [],
        rowCount: payload.rowCount ?? 0,
        samples: payload.samples ?? [],
      });
      setMapping(payload.guessedMapping ?? {});
    } catch (cause) {
      setPreview(null);
      setMapping({});
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }

  async function importProspects(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !preview) {
      setError("Choose and preview a spreadsheet first.");
      return;
    }
    const targets = Object.values(mapping);
    if (!["company", "name", "website"].some(target => targets.includes(target))) {
      setError("Map at least one column to Business name, Person, or Website.");
      return;
    }
    setBusy("import");
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("mapping", JSON.stringify(mapping));
      form.set("defaultSource", defaultSource.trim() || "sheet-import");
      form.set("defaultNiche", defaultNiche.trim());
      form.set("defaultTags", defaultTags.trim());
      const response = await fetch("/api/portal/leads-pipeline/prospects/import", { method: "POST", body: form });
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        error?: string;
        imported?: number;
        skipped?: Array<{ rowNumber: number; reason: string }>;
        unrecognisedHeaders?: string[];
      } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error ?? "Could not import this prospect list.");
      const skipped = payload.skipped?.length ?? 0;
      const unused = payload.unrecognisedHeaders?.length ? ` Unused: ${payload.unrecognisedHeaders.join(", ")}.` : "";
      onImported(`${payload.imported ?? 0} prospects added to Scouting${skipped ? `; ${skipped} duplicate or incomplete rows skipped` : ""}.${unused}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[95] grid place-items-center overflow-y-auto bg-black/45 p-3 sm:p-6">
      <form ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="prospect-import-title" onSubmit={importProspects} className="my-auto w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-black/10 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#16776f]">Scouting intake</p>
            <h2 id="prospect-import-title" className="mt-1 text-xl font-semibold text-black/90">Import and classify a prospect list</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-black/65">Bring in Claffy, networking, directory, CSV, TSV, or XLSX rows. Check the samples and choose exactly what every heading means before anything is saved.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy === "import"} aria-label="Close prospect import" className="grid size-11 shrink-0 place-items-center rounded-md border border-black/10 text-black/65 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:opacity-40"><X size={16} aria-hidden="true" /></button>
        </header>

        <div className="max-h-[min(75vh,54rem)] overflow-y-auto px-4 py-5 sm:px-6">
          <label className="block rounded-lg border border-dashed border-black/20 bg-black/[0.02] p-4">
            <span className="flex items-center gap-2 text-sm font-semibold text-black/75"><FileSpreadsheet size={16} aria-hidden="true" /> Choose prospect spreadsheet</span>
            <span className="mt-1 block text-xs leading-5 text-black/65">XLSX, CSV, or TSV. Maximum 5 MB and 500 data rows per import.</span>
            <input ref={fileRef} type="file" required accept=".xlsx,.csv,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/tab-separated-values" onChange={event => void previewFile(event.target.files?.[0])} className="mt-3 block min-h-11 w-full rounded-md text-sm text-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-md file:border-0 file:bg-black file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white" />
          </label>

          {busy === "preview" ? <p className="mt-4 text-sm text-black/65" role="status">Reading headings and sample rows…</p> : null}
          {error ? <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p> : null}

          {preview ? (
            <section className="mt-5" aria-labelledby="prospect-field-mapping">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><h3 id="prospect-field-mapping" className="flex items-center gap-2 text-sm font-semibold text-black/80"><SlidersHorizontal size={15} aria-hidden="true" /> Match spreadsheet headings</h3><p className="mt-1 text-xs text-black/65">{preview.filename} · {preview.rowCount} rows · {preview.headers.length} columns</p></div>
                <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="aqua-prospect-import-template.csv" className="inline-flex min-h-11 items-center rounded-sm text-xs font-semibold text-[#166a64] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Download template</a>
              </div>
              <div className="mt-3 grid gap-2">
                {preview.headers.map((header, index) => (
                  <div key={`${header}:${index}`} className="grid gap-2 rounded-md bg-black/[0.025] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(13rem,.8fr)] sm:items-center">
                    <div className="min-w-0"><p className="truncate text-xs font-semibold text-black/75">{header || `Column ${index + 1}`}</p><p className="mt-1 truncate text-[11px] text-black/65">{preview.samples.map(row => row[index]).filter(Boolean).slice(0, 3).join(" · ") || "No sample values"}</p></div>
                    <select aria-label={`Map ${header || `column ${index + 1}`}`} value={mapping[String(index)] ?? "skip"} onChange={event => setColumnMapping(index, event.target.value)} className="min-h-11 w-full rounded-md border border-black/10 bg-white px-3 text-xs text-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
                      <option value="skip">Do not import</option>
                      {PROSPECT_FIELDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <label className="text-xs font-medium text-black/65">Default source<input value={defaultSource} onChange={event => setDefaultSource(event.target.value)} placeholder="claffy-import" className="mt-1 min-h-11 w-full rounded-md border border-black/10 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2" /></label>
                <label className="text-xs font-medium text-black/65">Default niche<input value={defaultNiche} onChange={event => setDefaultNiche(event.target.value)} placeholder="e.g. local services" className="mt-1 min-h-11 w-full rounded-md border border-black/10 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2" /></label>
                <label className="text-xs font-medium text-black/65">Default tags<input value={defaultTags} onChange={event => setDefaultTags(event.target.value)} placeholder="claffy, imported" className="mt-1 min-h-11 w-full rounded-md border border-black/10 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2" /></label>
              </div>
              <p className="mt-3 text-xs leading-5 text-black/65">Every row enters Scouting as unreviewed. Spreadsheet notes are retained, and each record is immediately available in both Researching and Outreach Command.</p>
            </section>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-black/10 bg-[#fbfaf8] px-4 py-3 sm:px-6">
          <button type="button" onClick={onClose} disabled={busy === "import"} className="min-h-11 rounded-md border border-black/10 bg-white px-4 text-xs font-semibold text-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:opacity-40">Cancel</button>
          <button type="submit" disabled={!preview || busy !== null} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-black px-4 text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:opacity-40"><Upload size={14} aria-hidden="true" />{busy === "import" ? "Importing…" : "Approve mapping and import"}</button>
        </footer>
      </form>
    </div>
  );
}
