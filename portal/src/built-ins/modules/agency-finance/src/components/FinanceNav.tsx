const ITEMS = [
  ["Overview", "/portal/agency/agency-finance"],
  ["Income", "/portal/agency/agency-finance/payments"],
  ["Expenses", "/portal/agency/agency-finance/expenses"],
  ["Invoices", "/portal/agency/agency-finance/invoices"],
  ["Reports", "/portal/agency/agency-finance/reports"],
] as const;

export function FinanceNav({ active }: { active: "overview" | "income" | "expenses" | "invoices" | "reports" }) {
  return <nav aria-label="Finance sections" className="flex gap-5 overflow-x-auto border-b border-black/10">
    {ITEMS.map(([label, href]) => {
      const id = label.toLowerCase() as typeof active;
      return <a key={id} href={href} className={`relative min-h-10 whitespace-nowrap py-2.5 text-sm font-medium ${active === id ? "text-black" : "text-black/45 hover:text-black/75"}`}>
        {label}{active === id ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-black" /> : null}
      </a>;
    })}
  </nav>;
}
