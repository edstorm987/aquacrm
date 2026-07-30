import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

export function CollapsibleSection({
  title,
  description,
  badge,
  children,
  defaultOpen = false,
}: {
  title: string;
  description?: string;
  badge?: string | number;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="group border-y border-black/10 bg-white/35">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-1 py-3">
        <ChevronRight size={16} className="shrink-0 text-black/35 transition-transform group-open:rotate-90" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-black/80">{title}</span>
          {description ? <span className="mt-0.5 block truncate text-xs text-black/45">{description}</span> : null}
        </span>
        {badge !== undefined ? <span className="rounded-full bg-black/5 px-2 py-1 text-[11px] font-medium text-black/50">{badge}</span> : null}
      </summary>
      <div className="border-t border-black/[0.07] px-1 py-4">{children}</div>
    </details>
  );
}
