import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SkipToContent } from "@/components/ui/SkipToContent";
import dynamic from "next/dynamic";
import { COLOR_MODE_SCRIPT } from "@/lib/chrome/colorMode";
import { SIDEBAR_COLLAPSE_HYDRATION_SCRIPT } from "@/components/chrome/sidebarCollapseState";

// Defer chrome client islands so they don't block first paint of the
// page content for slow connections.
const PageReveal = dynamic(() => import("@/components/chrome/PageReveal").then(m => m.PageReveal));
const ScrollClassToggle = dynamic(() => import("@/components/chrome/ScrollClassToggle").then(m => m.ScrollClassToggle));

export const metadata: Metadata = {
  title: "AquaCRM",
  description: "AquaCRM business operations and secure client portal.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: COLOR_MODE_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_COLLAPSE_HYDRATION_SCRIPT }} />
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
