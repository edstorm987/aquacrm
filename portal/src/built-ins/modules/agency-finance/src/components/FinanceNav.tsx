import { ArrowDownToLine, ArrowUpFromLine, BarChart3, FileText, Landmark, LayoutDashboard, LockKeyhole, Settings, Sparkles, Target, WalletCards, type LucideIcon } from "lucide-react";
import { AttentionDot } from "@/components/chrome/NotificationAttentionProvider";
import { FINANCE_SECTIONS, type FinanceSectionKey } from "../lib/sections";

// Icons live with the renderer, keyed off the canonical section list. Adding a
// finance section is a one-line edit in ../lib/sections.ts plus an icon here.
const ICONS: Record<FinanceSectionKey, LucideIcon> = {
  overview: LayoutDashboard,
  income: ArrowDownToLine,
  expenses: ArrowUpFromLine,
  invoices: FileText,
  reports: BarChart3,
  budgets: WalletCards,
  operations: Landmark,
  planning: Target,
  plans: Sparkles,
  deposits: LockKeyhole,
  settings: Settings,
};

export function FinanceNav({ active }: { active: FinanceSectionKey }) {
  return <nav aria-label="Finance sections" className="flex gap-3 overflow-x-auto border-b border-black/10 sm:gap-5">
    {FINANCE_SECTIONS.map(section => {
      const Icon = ICONS[section.key];
      const href = section.href;
      const isActive = active === section.key;
      return <a key={section.key} href={href} className={`relative inline-flex min-h-10 items-center gap-2 whitespace-nowrap py-2.5 text-sm font-medium ${isActive ? "text-black" : "text-black/45 hover:text-black/75"}`}>
        <Icon size={15} aria-hidden="true" />{section.label}<AttentionDot href={href} />{isActive ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-black" /> : null}
      </a>;
    })}
  </nav>;
}
