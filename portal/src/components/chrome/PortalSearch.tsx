"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Bot, Building2, CalendarDays, CircleDollarSign, Contact, FileSearch2, FileText, FlaskConical, MessageSquare, NotebookPen, Package, Search, UserRound, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export interface PortalSearchItem {
  label: string;
  href: string;
}

interface RecordResult {
  id: string;
  category: string;
  title: string;
  subtitle?: string;
  href: string;
}

export function PortalSearch({ items, recordsEnabled = false }: { items: PortalSearchItem[]; recordsEnabled?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recordResults, setRecordResults] = useState<RecordResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("All");
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
    setQuery("");
    setCategoryFilter("All");
  }, [pathname]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    }
    function onPointer(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const normalised = query.trim();
    if (!recordsEnabled || !open || normalised.length < 2) {
      setRecordResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/portal/search?q=${encodeURIComponent(normalised)}`, { signal: controller.signal });
        const json = await response.json().catch(() => null) as { results?: RecordResult[] } | null;
        if (response.ok) setRecordResults(json?.results ?? []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setRecordResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, recordsEnabled]);

  useEffect(() => {
    setCategoryFilter("All");
  }, [query]);

  const uniqueItems = useMemo(() => {
    const seen = new Set<string>();
    return items.filter(item => {
      if (seen.has(item.href)) return false;
      seen.add(item.href);
      return true;
    });
  }, [items]);
  const normalised = query.trim().toLowerCase();
  const pageResults = uniqueItems
    .filter(item => !normalised || item.label.toLowerCase().includes(normalised))
    .slice(0, normalised ? 5 : 8);
  const categories = useMemo(() => [...new Set(recordResults.map(result => result.category))], [recordResults]);
  const filteredRecords = categoryFilter === "All"
    ? recordResults
    : recordResults.filter(result => result.category === categoryFilter);
  const groupedRecords = useMemo(() => {
    const groups = new Map<string, RecordResult[]>();
    for (const result of filteredRecords) {
      const group = groups.get(result.category) ?? [];
      group.push(result);
      groups.set(result.category, group);
    }
    return [...groups.entries()];
  }, [filteredRecords]);

  return (
    <div ref={wrapRef} className="mm-private-chrome relative">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-label="Search workspace"
        aria-expanded={open}
        className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 bg-white px-2.5 text-black/60 shadow-sm hover:border-black/20 lg:min-w-48 lg:justify-start"
      >
        <Search size={14} aria-hidden="true" />
        <span className="hidden text-xs lg:inline">Search workspace</span>
        <kbd className="ml-auto hidden rounded border border-black/10 bg-black/[0.025] px-1.5 py-0.5 text-[10px] font-medium text-black/40 xl:inline">⌘K</kbd>
      </button>

      {open ? (
        <div className="fixed inset-x-3 top-16 z-50 rounded-md border border-black/10 bg-white p-2 shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[38rem]">
          <div className="flex items-center gap-2 border-b border-black/8 px-2 pb-2">
            <Search size={15} className="shrink-0 text-black/35" aria-hidden="true" />
            <input
              ref={inputRef}
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={recordsEnabled ? "Search notes, messages, clients, invoices..." : "Search pages..."}
              aria-label={recordsEnabled ? "Search everything" : "Search pages"}
              className="min-h-9 min-w-0 flex-1 border-0 bg-transparent px-1 text-sm outline-none"
            />
            <button type="button" onClick={() => setOpen(false)} aria-label="Close search" className="grid size-8 place-items-center rounded-md text-black/40 hover:bg-black/5">
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          {normalised && !loading && recordResults.length ? (
            <div className="border-b border-black/[0.07] px-2 py-2">
              <div className="mb-2 flex items-center justify-between gap-3 px-1">
                <p className="text-[11px] font-medium text-black/45">{recordResults.length} workspace {recordResults.length === 1 ? "record" : "records"} found</p>
                {categoryFilter !== "All" ? <button type="button" onClick={() => setCategoryFilter("All")} className="text-[11px] font-medium text-black/50 underline decoration-black/20 underline-offset-2">Clear filter</button> : null}
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                {["All", ...categories].map(category => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setCategoryFilter(category)}
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${categoryFilter === category ? "border-black bg-black text-white" : "border-black/10 bg-white text-black/55 hover:border-black/25"}`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-1 max-h-[28rem] overflow-y-auto">
            {groupedRecords.map(([category, results]) => (
              <section key={category} className="border-b border-black/[0.06] py-1 last:border-0">
                <p className="px-3 py-1 text-[10px] font-semibold uppercase text-black/35">{category}</p>
                {results.map(result => (
                  <Link key={`${result.category}:${result.id}`} href={result.href} className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-black/70 hover:bg-black/[0.04] hover:text-black">
                    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-black/[0.045] text-black/45">{resultIcon(result.category)}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{result.title}</span>{result.subtitle ? <span className="mt-0.5 block truncate text-[11px] text-black/40">{result.subtitle}</span> : null}</span>
                    <ArrowUpRight size={13} className="shrink-0 text-black/25" aria-hidden="true" />
                  </Link>
                ))}
              </section>
            ))}
            {pageResults.length ? (
              <section className="py-1">
                <p className="px-3 py-1 text-[10px] font-semibold uppercase text-black/35">Pages</p>
                {pageResults.map(item => (
                  <Link key={item.href} href={item.href} className="flex min-h-10 items-center justify-between rounded-md px-3 text-sm text-black/65 hover:bg-black/[0.04] hover:text-black">
                    <span>{item.label}</span>
                    <ArrowUpRight size={13} className="text-black/25" aria-hidden="true" />
                  </Link>
                ))}
              </section>
            ) : null}
            {loading ? <p className="px-3 py-4 text-center text-xs text-black/40">Searching the workspace...</p> : null}
            {!loading && normalised && !recordResults.length && !pageResults.length ? <p className="px-3 py-5 text-center text-xs text-black/40">Nothing matched “{query.trim()}”.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function resultIcon(category: string) {
  if (category === "Company") return <Building2 size={14} />;
  if (category === "Client") return <UsersRound size={14} />;
  if (category === "Contact" || category === "Lead" || category === "Staff") return <UserRound size={14} />;
  if (category === "Product") return <Package size={14} />;
  if (category === "Invoice" || category === "Expense" || category === "Income") return <CircleDollarSign size={14} />;
  if (category === "SOP") return <FileText size={14} />;
  if (category === "Message") return <MessageSquare size={14} />;
  if (category === "Note" || category === "Client data") return <NotebookPen size={14} />;
  if (category === "Meeting") return <CalendarDays size={14} />;
  if (category === "Assistant") return <Bot size={14} />;
  if (category === "Experiment") return <FlaskConical size={14} />;
  if (category === "File" || category === "Contract" || category === "Form") return <FileSearch2 size={14} />;
  return <Contact size={14} />;
}
