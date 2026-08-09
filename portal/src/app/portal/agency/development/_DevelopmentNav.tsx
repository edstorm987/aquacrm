import Link from "next/link";
import { Blocks, BookOpen, Gauge, GitBranch, Workflow } from "lucide-react";

const items = [
  { href: "/portal/agency/development", label: "Control centre", icon: GitBranch },
  { href: "/portal/agency/development/performance", label: "Performance", icon: Gauge },
  { href: "/portal/agency/development/toolkit", label: "Toolkit", icon: Blocks },
  { href: "/portal/agency/development/workflow", label: "Build flow", icon: Workflow },
  { href: "/portal/agency/development/vault", label: "Knowledge vault", icon: BookOpen },
] as const;

export function DevelopmentNav({ active }: { active: "toolkit" | "workflow" | "vault" | "website" | "systems" | "performance" }) {
  return (
    <nav aria-label="Development workspace" className="flex gap-1 overflow-x-auto border-b border-black/10">
      {items.map(item => {
        const Icon = item.icon;
        const id = item.href.endsWith("/performance") ? "performance" : item.href.endsWith("/toolkit") ? "toolkit" : item.href.endsWith("/workflow") ? "workflow" : item.href.endsWith("/vault") ? "vault" : item.href.endsWith("/website") ? "website" : "systems";
        return <Link key={item.href} href={item.href} aria-current={active === id ? "page" : undefined} className={`inline-flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium ${active === id ? "border-brand text-brand" : "border-transparent text-black/50 hover:text-black/75"}`}><Icon size={16} />{item.label}</Link>;
      })}
    </nav>
  );
}
