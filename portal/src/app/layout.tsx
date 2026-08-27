import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
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
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="aqua-color-mode-bootstrap" strategy="beforeInteractive">
          {COLOR_MODE_SCRIPT}
        </Script>
        <Script id="aqua-sidebar-collapse-bootstrap" strategy="beforeInteractive">
          {SIDEBAR_COLLAPSE_HYDRATION_SCRIPT}
        </Script>
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
