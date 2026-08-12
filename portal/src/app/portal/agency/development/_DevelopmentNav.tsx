import Link from "next/link";
import { Blocks, BookOpen, Gauge, GitBranch, Globe2, LayoutDashboard, Workflow } from "lucide-react";
import { AttentionDot } from "@/components/chrome/NotificationAttentionProvider";

const items = [
  { id: "overview", href: "/portal/agency/development", label: "Dashboard", icon: LayoutDashboard },
  { id: "systems", href: "/portal/agency/development?view=workspace", label: "Projects", icon: GitBranch },
  { id: "website", href: "/portal/agency/development/website", label: "Website", icon: Globe2 },
  { id: "performance", href: "/portal/agency/development/performance", label: "Performance", icon: Gauge },
  { id: "toolkit", href: "/portal/agency/development/toolkit", label: "Toolkit", icon: Blocks },
  { id: "workflow", href: "/portal/agency/development/workflow", label: "Build flow", icon: Workflow },
  { id: "vault", href: "/portal/agency/development/vault", label: "Knowledge vault", icon: BookOpen },
] as const;

export function DevelopmentNav({ active }: { active: "overview" | "toolkit" | "workflow" | "vault" | "website" | "systems" | "performance" }) {
  return (
    <nav aria-label="Development workspace" className="flex gap-1 overflow-x-auto border-b border-black/10">
      {items.map(item => {
        const Icon = item.icon;
        return <Link key={item.id} href={item.href} aria-current={active === item.id ? "page" : undefined} className={`inline-flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium ${active === item.id ? "border-brand text-brand" : "border-transparent text-black/50 hover:text-black/75"}`}><Icon size={16} />{item.label}<AttentionDot href={item.href} /></Link>;
      })}
    </nav>
  );
}
