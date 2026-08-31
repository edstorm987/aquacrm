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
  // Without this every route inherits NO icon declaration, so the browser falls
  // back to requesting `/favicon.ico` — which does not exist here (the assets
  // are `favicon-default*`), giving a 404 on the first navigation into the app.
  // The browser matrix caught it on the marketing home page. The files already
  // existed and are already referenced by the web manifest; nothing new is
  // added, they are simply declared where the document can find them.
  icons: {
    icon: [
      { url: "/favicon-default.ico", sizes: "any" },
      { url: "/favicon-default-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-default-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: { url: "/favicon-default-180.png", sizes: "180x180" },
  },
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
