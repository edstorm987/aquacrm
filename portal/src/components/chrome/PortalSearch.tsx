"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Bell,
  Bot,
  Building2,
  CalendarDays,
  CircleDollarSign,
  Contact,
  FileSearch2,
  FileText,
  FlaskConical,
  Inbox,
  LoaderCircle,
  MessageSquare,
  NotebookPen,
  Package,
  Search,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

export interface PortalSearchItem {
  label: string;
  href: string;
}

interface RecordResult {
  id: string;
  category: string;
  title: string;
  subtitle?: string;
  excerpt?: string;
  matchedOn?: string;
  timestamp?: number;
  href: string;
}

interface SearchOption {
  key: string;
  href: string;
  kind: "record" | "page";
  result?: RecordResult;
  page?: PortalSearchItem;
}

export function PortalSearch({ items, recordsEnabled = false }: { items: PortalSearchItem[]; recordsEnabled?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recordResults, setRecordResults] = useState<RecordResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [activeIndex, setActiveIndex] = useState(0);
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
        setOpen(value => !value);
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
    if (open) window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!recordsEnabled) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch("/api/portal/search?warm=1", { signal: controller.signal }).catch(() => undefined);
    }, 600);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [recordsEnabled]);

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
        else setRecordResults([]);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setRecordResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 150);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, recordsEnabled]);

  useEffect(() => {
    setCategoryFilter("All");
    setActiveIndex(0);
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
  const pageResults = useMemo(() => uniqueItems
    .filter(item => !normalised || item.label.toLowerCase().includes(normalised))
    .slice(0, normalised ? 5 : 8), [normalised, uniqueItems]);
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const result of recordResults) counts.set(result.category, (counts.get(result.category) ?? 0) + 1);
    return [...counts.entries()];
  }, [recordResults]);
  const filteredRecords = useMemo(() => categoryFilter === "All"
    ? recordResults
    : recordResults.filter(result => result.category === categoryFilter), [categoryFilter, recordResults]);
  const options = useMemo<SearchOption[]>(() => [
    ...filteredRecords.map(result => ({ key: `${result.category}:${result.id}`, href: result.href, kind: "record" as const, result })),
    ...(categoryFilter === "All" ? pageResults.map(page => ({ key: `page:${page.href}`, href: page.href, kind: "page" as const, page })) : []),
  ], [categoryFilter, filteredRecords, pageResults]);

  useEffect(() => {
    setActiveIndex(current => Math.min(current, Math.max(0, options.length - 1)));
  }, [options.length]);

  function closeSearch() {
    setOpen(false);
  }

  function chooseOption(option: SearchOption | undefined) {
    if (!option) return;
    closeSearch();
    router.push(option.href);
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(current => options.length ? (current + 1) % options.length : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(current => options.length ? (current - 1 + options.length) % options.length : 0);
    } else if (event.key === "Enter") {
      event.preventDefault();
      chooseOption(options[activeIndex]);
    }
  }

  return (
    <div ref={wrapRef} className="mm-private-chrome relative">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-label="Search workspace"
        aria-expanded={open}
        aria-controls="aqua-workspace-search"
        className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 bg-white px-2.5 text-black/60 shadow-sm transition hover:border-black/20 hover:text-black lg:min-w-48 lg:justify-start"
      >
        <Search size={15} aria-hidden="true" />
        <span className="hidden text-xs lg:inline">Search workspace</span>
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/15 backdrop-blur-[1px]" aria-hidden="true" onMouseDown={closeSearch} />
          <section
            id="aqua-workspace-search"
            aria-label="Workspace search"
            className="fixed inset-x-3 top-[4.5rem] z-50 flex max-h-[calc(100dvh-5.25rem)] flex-col overflow-hidden rounded-md border border-black/12 bg-white shadow-[0_24px_70px_rgba(0,0,0,0.24)] sm:left-1/2 sm:right-auto sm:top-20 sm:w-[min(48rem,calc(100vw-2rem))] sm:-translate-x-1/2"
          >
            <div className="border-b border-black/10 p-3 sm:p-4">
              <div className="mm-universal-search-field flex min-h-12 items-center gap-3 rounded-md border border-black/12 bg-black/[0.025] px-3 transition focus-within:border-brand/45 focus-within:bg-white focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--brand-primary)_11%,transparent)]">
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-brand/10 text-brand">
                  {loading ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <Search size={17} aria-hidden="true" />}
                </span>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  onKeyDown={onInputKeyDown}
                  placeholder={recordsEnabled ? "Search people, enquiries, messages, notes..." : "Search pages..."}
                  aria-label={recordsEnabled ? "Search all workspace records" : "Search pages"}
                  aria-autocomplete="list"
                  aria-controls="aqua-search-results"
                  aria-activedescendant={options[activeIndex] ? `aqua-search-option-${activeIndex}` : undefined}
                  role="combobox"
                  className="mm-universal-search-input min-h-11 min-w-0 flex-1 border-0 bg-transparent px-0 text-[15px] font-medium text-black outline-none placeholder:font-normal placeholder:text-black/35"
                />
                {query ? (
                  <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="grid size-8 shrink-0 place-items-center rounded-md text-black/35 hover:bg-black/[0.05] hover:text-black/70">
                    <X size={15} aria-hidden="true" />
                  </button>
                ) : null}
                <button type="button" onClick={closeSearch} aria-label="Close search" className="grid size-8 shrink-0 place-items-center rounded-md border border-black/10 bg-white text-black/45 hover:border-black/20 hover:text-black">
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
            </div>

            {normalised && (recordResults.length > 0 || loading) ? (
              <div className="flex min-h-11 items-end gap-5 overflow-x-auto border-b border-black/[0.08] px-4" aria-label="Search result filters">
                <CategoryTab label="All" count={recordResults.length} active={categoryFilter === "All"} onClick={() => { setCategoryFilter("All"); setActiveIndex(0); }} />
                {categories.map(([category, count]) => (
                  <CategoryTab key={category} label={category} count={count} active={categoryFilter === category} onClick={() => { setCategoryFilter(category); setActiveIndex(0); }} />
                ))}
              </div>
            ) : null}

            <div id="aqua-search-results" role="listbox" aria-label="Search results" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 sm:p-3">
              {filteredRecords.length ? (
                <div className="pb-1">
                  <div className="flex items-center justify-between px-2 pb-2 pt-1">
                    <p className="text-[11px] font-semibold uppercase text-black/40">Best matches</p>
                    <p className="text-[11px] text-black/40">{filteredRecords.length} {filteredRecords.length === 1 ? "result" : "results"}</p>
                  </div>
                  {filteredRecords.map((result, index) => (
                    <SearchResultRow
                      key={`${result.category}:${result.id}`}
                      result={result}
                      query={query}
                      optionIndex={index}
                      active={activeIndex === index}
                      onActive={() => setActiveIndex(index)}
                      onChoose={closeSearch}
                    />
                  ))}
                </div>
              ) : null}

              {pageResults.length && categoryFilter === "All" ? (
                <div className={filteredRecords.length ? "mt-1 border-t border-black/[0.07] pt-2" : ""}>
                  <p className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase text-black/40">{normalised ? "Pages" : "Go to"}</p>
                  <div className={normalised ? "" : "grid gap-1 sm:grid-cols-2"}>
                    {pageResults.map((item, pageIndex) => {
                      const optionIndex = filteredRecords.length + pageIndex;
                      const active = activeIndex === optionIndex;
                      return (
                        <Link
                          id={`aqua-search-option-${optionIndex}`}
                          role="option"
                          aria-selected={active}
                          key={item.href}
                          href={item.href}
                          onMouseEnter={() => setActiveIndex(optionIndex)}
                          onFocus={() => setActiveIndex(optionIndex)}
                          onClick={closeSearch}
                          className={`flex min-h-11 items-center justify-between rounded-md px-3 text-sm transition ${active ? "bg-black/[0.055] text-black" : "text-black/65 hover:bg-black/[0.035] hover:text-black"}`}
                        >
                          <span>{highlightText(item.label, query)}</span>
                          <ArrowUpRight size={14} className="shrink-0 text-black/25" aria-hidden="true" />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {loading && !recordResults.length ? (
                <div className="space-y-1 py-1" aria-label="Searching">
                  {[0, 1, 2, 3].map(item => <div key={item} className="h-[4.5rem] animate-pulse rounded-md bg-black/[0.035]" />)}
                </div>
              ) : null}
              {!loading && normalised.length === 1 ? <SearchMessage title="Keep typing" detail="Enter at least two characters." /> : null}
              {!loading && normalised.length > 1 && !recordResults.length && !pageResults.length ? <SearchMessage title="No matches" detail={`Nothing found for “${query.trim()}”.`} /> : null}
            </div>

            <p className="sr-only" aria-live="polite">
              {loading ? "Searching" : normalised.length > 1 ? `${options.length} search results` : "Search ready"}
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}

function CategoryTab({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`relative flex min-h-10 shrink-0 items-center gap-1.5 border-b-2 px-0.5 text-xs font-semibold transition ${active ? "border-brand text-black" : "border-transparent text-black/45 hover:text-black/70"}`}
    >
      {label}<span className="text-[10px] font-medium text-black/35">{count}</span>
    </button>
  );
}

function SearchResultRow({ result, query, optionIndex, active, onActive, onChoose }: {
  result: RecordResult;
  query: string;
  optionIndex: number;
  active: boolean;
  onActive: () => void;
  onChoose: () => void;
}) {
  return (
    <Link
      id={`aqua-search-option-${optionIndex}`}
      role="option"
      aria-selected={active}
      href={result.href}
      onMouseEnter={onActive}
      onFocus={onActive}
      onClick={onChoose}
      className={`group flex min-h-[4.5rem] items-start gap-3 rounded-md px-3 py-2.5 transition ${active ? "bg-black/[0.055] text-black" : "text-black/70 hover:bg-black/[0.035] hover:text-black"}`}
    >
      <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-md ${active ? "bg-brand text-white" : "bg-black/[0.045] text-black/50"}`}>
        {resultIcon(result.category)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold">{highlightText(result.title, query)}</span>
          <span className="shrink-0 text-[10px] font-medium uppercase text-black/35">{result.category}</span>
        </span>
        {result.excerpt ? <span className="mt-1 line-clamp-2 block text-xs leading-5 text-black/48">{highlightText(result.excerpt, query)}</span> : result.subtitle ? <span className="mt-1 block truncate text-xs text-black/45">{highlightText(result.subtitle, query)}</span> : null}
        <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] text-black/35">
          {result.matchedOn ? <span>{result.matchedOn}</span> : null}
          {result.timestamp ? <time dateTime={new Date(result.timestamp).toISOString()}>{formatResultTime(result.timestamp)}</time> : null}
        </span>
      </span>
      <ArrowUpRight size={14} className="mt-2 shrink-0 text-black/20 transition group-hover:text-black/45" aria-hidden="true" />
    </Link>
  );
}

function SearchMessage({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="grid min-h-36 place-items-center px-5 text-center">
      <div>
        <span className="mx-auto grid size-9 place-items-center rounded-md bg-black/[0.045] text-black/35"><Search size={16} /></span>
        <p className="mt-3 text-sm font-semibold text-black/70">{title}</p>
        <p className="mt-1 text-xs text-black/40">{detail}</p>
      </div>
    </div>
  );
}

function highlightText(value: string, query: string): ReactNode {
  const needle = query.trim();
  if (!needle) return value;
  const index = value.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
  if (index < 0) return value;
  return <>{value.slice(0, index)}<mark className="rounded-sm bg-brand/12 px-0.5 text-inherit">{value.slice(index, index + needle.length)}</mark>{value.slice(index + needle.length)}</>;
}

function formatResultTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: date.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

function resultIcon(category: string) {
  if (category === "Company") return <Building2 size={16} />;
  if (category === "Client") return <UsersRound size={16} />;
  if (category === "Contact" || category === "Lead" || category === "Staff") return <UserRound size={16} />;
  if (category === "Enquiry") return <Inbox size={16} />;
  if (category === "Product") return <Package size={16} />;
  if (category === "Invoice" || category === "Expense" || category === "Income") return <CircleDollarSign size={16} />;
  if (category === "SOP") return <FileText size={16} />;
  if (category === "Message") return <MessageSquare size={16} />;
  if (category === "Note" || category === "Client data") return <NotebookPen size={16} />;
  if (category === "Meeting") return <CalendarDays size={16} />;
  if (category === "Assistant") return <Bot size={16} />;
  if (category === "Notification") return <Bell size={16} />;
  if (category === "Experiment") return <FlaskConical size={16} />;
  if (category === "File" || category === "Contract" || category === "Form") return <FileSearch2 size={16} />;
  return <Contact size={16} />;
}
