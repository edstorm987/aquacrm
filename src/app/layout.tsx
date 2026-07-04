import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SkipToContent } from "@/components/ui/SkipToContent";
import { SidebarCollapseHydrationScript } from "@/components/chrome/SidebarCollapseToggle";
import dynamic from "next/dynamic";

// Defer chrome client islands so they don't block first paint of the
// page content for slow connections.
const PageReveal = dynamic(() => import("@/components/chrome/PageReveal").then(m => m.PageReveal));
const ScrollClassToggle = dynamic(() => import("@/components/chrome/ScrollClassToggle").then(m => m.ScrollClassToggle));

export const metadata: Metadata = {
  title: "Aqua portal",
  description: "Milesymedia's agency platform — a portal to anywhere.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* T1 R035 — synchronous read of localStorage["mm-sidebar-collapsed"]
            so the desktop <aside> renders at the correct width before
            paint. No flash on reload. */}
        <SidebarCollapseHydrationScript />
      </head>
      <body>
        <PageReveal />
        <ScrollClassToggle threshold={40} />
        <SkipToContent />
        {children}
      </body>
    </html>
  );
}
