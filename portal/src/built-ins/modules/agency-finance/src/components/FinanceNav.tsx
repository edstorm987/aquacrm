import { ArrowDownToLine, ArrowUpFromLine, BarChart3, FileText, Landmark, LayoutDashboard, Target, WalletCards } from "lucide-react";
import { AttentionDot } from "@/components/chrome/NotificationAttentionProvider";

const ITEMS = [
  ["Overview", "/portal/agency/agency-finance", LayoutDashboard],
  ["Income", "/portal/agency/agency-finance/payments", ArrowDownToLine],
  ["Expenses", "/portal/agency/agency-finance/expenses", ArrowUpFromLine],
  ["Invoices", "/portal/agency/agency-finance/invoices", FileText],
  ["Reports", "/portal/agency/agency-finance/reports", BarChart3],
  ["Budgets", "/portal/agency/agency-finance/budgets", WalletCards],
  ["Operations", "/portal/agency/agency-finance/operations", Landmark],
  ["Planning", "/portal/agency/agency-finance/planning", Target],
] as const;

export function FinanceNav({ active }: { active: "overview" | "income" | "expenses" | "invoices" | "reports" | "budgets" | "operations" | "planning" }) {
  return <nav aria-label="Finance sections" className="flex gap-3 overflow-x-auto border-b border-black/10 sm:gap-5">
    {ITEMS.map(([label, href, Icon]) => {
      const id = label.toLowerCase() as typeof active;
      return <a key={id} href={href} className={`relative inline-flex min-h-10 items-center gap-2 whitespace-nowrap py-2.5 text-sm font-medium ${active === id ? "text-black" : "text-black/45 hover:text-black/75"}`}>
        <Icon size={15} aria-hidden="true" />{label}<AttentionDot href={href} />{active === id ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-black" /> : null}
      </a>;
    })}
  </nav>;
}
