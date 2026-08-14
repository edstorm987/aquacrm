import Link from "next/link";
import { ArrowUpRight, Building2, Database, Package, UsersRound } from "lucide-react";

import type { BrandPortfolioSnapshot } from "@/lib/brandPortfolio";

export function BrandPortfolioInstrument({ snapshot }: { snapshot: BrandPortfolioSnapshot }) {
  const financial = snapshot.financeConnected && snapshot.totalRevenueCents > 0;
  const visibleRows = snapshot.rows;
  const footprintTotal = visibleRows.reduce((sum, row) => sum + footprint(row), 0);
  let cursor = 0;
  const segments = visibleRows.map(row => {
    const share = financial ? row.revenueSharePercent ?? 0 : footprintTotal ? footprint(row) / footprintTotal * 100 : 0;
    const start = cursor;
    cursor += share;
    return `${safeColour(row.colour)} ${start}% ${cursor}%`;
  });
  const chartBackground = segments.length && cursor > 0
    ? `conic-gradient(from -90deg, ${segments.join(", ")})`
    : "conic-gradient(from -90deg, rgba(98,232,255,.12) 0 100%)";

  return <section className="mt-5 overflow-hidden border border-[#62e8ff]/18 bg-[#020b11]/92" aria-labelledby="brand-portfolio-heading">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#62e8ff]/14 px-3 py-3 sm:px-4">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center border border-[#62e8ff]/22 bg-[#62e8ff]/[0.055] text-[#62e8ff]"><Building2 size={14} /></span>
        <div className="min-w-0"><p className="text-[7px] font-semibold uppercase text-[#76dff1]/52">PORTFOLIO ARRAY · BR-01</p><h2 id="brand-portfolio-heading" className="mt-0.5 text-xs font-semibold text-white/82">{financial ? "Recorded revenue contribution" : "Connected brand footprint"}</h2><p className="mt-0.5 text-[8px] leading-4 text-white/30">{financial ? "Paid income received in the current calendar month, allocated by invoice or client brand." : "No paid revenue is recorded this month. The plot uses allocated clients, leads and offers and does not claim financial share."}</p></div>
      </div>
      <div className="text-right"><strong className="block text-sm tabular-nums text-[#68f5d0]">{financial ? money(snapshot.totalRevenueCents, snapshot.currency) : `${footprintTotal} links`}</strong><span className="text-[7px] font-semibold uppercase text-white/26">{financial ? `${snapshot.totalRevenueRecords} paid records` : "record allocation"}</span></div>
    </header>

    <div className="grid min-w-0 md:grid-cols-[170px_minmax(0,1fr)]">
      <div className="grid place-items-center border-b border-[#62e8ff]/12 p-4 md:border-b-0 md:border-r">
        <div className="relative grid size-32 place-items-center rounded-full" style={{ background: chartBackground }} role="img" aria-label={financial ? "Revenue contribution by brand" : "Connected record footprint by brand"}>
          <span className="absolute inset-[15px] rounded-full border border-[#62e8ff]/18 bg-[#020b11] shadow-[inset_0_0_22px_rgba(98,232,255,.05)]" />
          <span className="relative text-center"><strong className="block text-xl tabular-nums text-white">{snapshot.rows.filter(row => !row.unallocated).length}</strong><span className="block text-[7px] font-semibold uppercase text-[#62e8ff]/45">brands plotted</span></span>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[7px] uppercase text-white/28"><Database size={10} className="text-[#62e8ff]" /> {financial ? "Finance ledger evidence" : "CRM allocation evidence"}</div>
      </div>

      <div className="divide-y divide-[#62e8ff]/10">
        {visibleRows.map(row => {
          const share = financial ? row.revenueSharePercent ?? 0 : footprintTotal ? footprint(row) / footprintTotal * 100 : 0;
          const href = row.unallocated ? "/portal/agency?station=battle" : `/portal/agency?station=battle&scope=${encodeURIComponent(`company:${row.id}`)}`;
          return <Link key={row.id} href={href} className="group grid min-w-0 grid-cols-[minmax(0,1fr)_72px] gap-3 px-3 py-2.5 hover:bg-[#62e8ff]/[0.045] sm:grid-cols-[minmax(0,1fr)_80px_84px] sm:px-4">
            <span className="min-w-0"><span className="flex items-center gap-2"><span className="size-1.5 shrink-0 shadow-[0_0_7px_currentColor]" style={{ backgroundColor: safeColour(row.colour), color: safeColour(row.colour) }} /><strong className="truncate text-[10px] text-white/67 group-hover:text-white">{row.label}</strong>{row.unallocated ? <span className="shrink-0 text-[6px] font-semibold uppercase text-amber-300/60">Needs allocation</span> : null}</span><span className="mt-1 block h-1 border border-[#62e8ff]/10 bg-black/35"><span className="block h-full" style={{ width: `${Math.max(share > 0 ? 3 : 0, share)}%`, backgroundColor: safeColour(row.colour) }} /></span></span>
            <span className="text-right"><strong className="block text-[11px] tabular-nums text-white/74">{financial ? money(row.monthRevenueCents, row.currency) : `${Math.round(share)}%`}</strong><span className="text-[7px] uppercase text-white/25">{financial ? `${share.toFixed(1)}% share` : "footprint"}</span></span>
            <span className="col-span-2 hidden items-center justify-end gap-3 text-[7px] uppercase text-white/28 sm:col-span-1 sm:flex"><span title="Active clients" className="inline-flex items-center gap-1"><UsersRound size={9} />{row.activeClients}</span><span title="Allocated offers" className="inline-flex items-center gap-1"><Package size={9} />{row.productCount}</span><ArrowUpRight size={9} className="text-[#62e8ff]/45" /></span>
          </Link>;
        })}
        {!visibleRows.length ? <p className="px-4 py-8 text-center text-[10px] text-white/30">Create a trading brand and allocate clients or offers to activate this instrument.</p> : null}
      </div>
    </div>
    <footer className="border-t border-[#62e8ff]/12 px-3 py-2 text-[7px] leading-3 text-white/22 sm:px-4">{financial ? "Formula: brand paid income received this month / all paid income received this month. Multi-currency values use the finance ledger display currency; no FX conversion is invented." : "Footprint formula: active clients + allocated leads + allocated offers. This is an allocation view, not external market share or revenue."}</footer>
  </section>;
}

function footprint(row: BrandPortfolioSnapshot["rows"][number]) {
  return row.activeClients + row.leadCount + row.productCount;
}

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(cents / 100);
}

function safeColour(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#62e8ff";
}
