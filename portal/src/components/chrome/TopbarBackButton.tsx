"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

export function topbarBackFallback(path: string): string {
  const clientMatch = path.match(/^\/portal\/clients\/([^/]+)(?:\/(.+))?$/);
  if (clientMatch?.[1] && clientMatch[2]) return `/portal/clients/${clientMatch[1]}`;
  if (clientMatch?.[1]) return "/portal/clients";
  if (path === "/portal/clients") return "/portal/agency";
  if (path.startsWith("/portal/agency/")) return "/portal/agency";
  if (path.startsWith("/portal/customer/")) return "/portal/customer";
  return "/";
}

export function TopbarBackButton() {
  const router = useRouter();
  const currentPath = usePathname();

  if (currentPath === "/portal/agency") return null;

  return (
    <button
      type="button"
      aria-label="Go back"
      title="Go back"
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
          return;
        }
        router.push(topbarBackFallback(currentPath));
      }}
      className="grid size-9 shrink-0 place-items-center rounded-md border border-black/10 bg-white text-black/65 transition hover:bg-black/[0.04] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25"
    >
      <ArrowLeft size={17} strokeWidth={1.8} aria-hidden />
    </button>
  );
}
