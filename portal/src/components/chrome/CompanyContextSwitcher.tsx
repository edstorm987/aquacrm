"use client";

import { Building2, Check, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface CompanyOption {
  id: string;
  name: string;
  primaryColor: string;
}

export function CompanyContextSwitcher({
  companies,
  activeCompanyId,
}: {
  companies: CompanyOption[];
  activeCompanyId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = companies.find(company => company.id === activeCompanyId);

  async function select(companyId: string | null) {
    setBusy(true);
    const response = await fetch("/api/auth/company-context", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyId }),
    });
    setBusy(false);
    if (!response.ok) return;
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        disabled={busy}
        className="inline-flex min-h-9 max-w-48 items-center gap-2 rounded-md border border-black/10 bg-white px-2.5 text-xs font-medium text-black/70 shadow-sm hover:bg-black/[0.025] disabled:opacity-50"
      >
        <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: active?.primaryColor ?? "#0B6F6D" }} />
        <span className="truncate">{active?.name ?? "All Milesymedia"}</span>
        <ChevronDown size={13} className="shrink-0 text-black/35" aria-hidden="true" />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-[calc(100%+6px)] z-50 w-64 overflow-hidden rounded-md border border-black/10 bg-white p-1.5 shadow-xl">
          <button
            type="button"
            role="menuitem"
            onClick={() => void select(null)}
            className="flex min-h-10 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs text-black/70 hover:bg-black/[0.035]"
          >
            <Building2 size={15} className="text-black/40" />
            <span className="min-w-0 flex-1"><strong className="block font-semibold">All Milesymedia</strong><span className="text-[10px] text-black/40">Parent view · everything</span></span>
            {!activeCompanyId ? <Check size={14} /> : null}
          </button>
          {companies.length ? <div className="my-1 border-t border-black/8" /> : null}
          {companies.map(company => (
            <button
              key={company.id}
              type="button"
              role="menuitem"
              onClick={() => void select(company.id)}
              className="flex min-h-10 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs text-black/70 hover:bg-black/[0.035]"
            >
              <span className="size-3 rounded-sm" style={{ backgroundColor: company.primaryColor }} />
              <span className="min-w-0 flex-1 truncate font-medium">{company.name}</span>
              {activeCompanyId === company.id ? <Check size={14} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
