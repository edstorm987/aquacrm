import Link from "next/link";

import type { Currency } from "../lib/domain";

export function FinanceCurrencyNav({
  active,
  available,
  path,
  label = "Currency",
}: {
  active: Currency;
  available: readonly Currency[];
  path: string;
  label?: string;
}) {
  const currencies = Array.from(new Set<Currency>([active, ...available]))
    .sort((left, right) => left.localeCompare(right));
  if (currencies.length < 2) {
    return <p className="text-xs font-semibold uppercase tracking-wide text-black/45">{label}: {active.toUpperCase()}</p>;
  }
  return (
    <nav aria-label={`${label} selection`} className="flex flex-wrap items-center gap-2 rounded-md border border-black/10 bg-black/[0.018] p-3">
      <span className="mr-1 text-xs font-semibold text-black/50">{label}</span>
      {currencies.map(currency => {
        const selected = currency === active;
        return (
          <Link
            key={currency}
            href={`${path}?currency=${currency}`}
            aria-current={selected ? "page" : undefined}
            className={`min-h-9 rounded-md border px-3 py-2 text-xs font-semibold ${selected ? "border-black bg-black text-white" : "border-black/10 bg-white text-black/60 hover:bg-black/[0.03]"}`}
          >
            {currency.toUpperCase()}
          </Link>
        );
      })}
    </nav>
  );
}
