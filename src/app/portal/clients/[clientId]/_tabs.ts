// Tab metadata — shared between server (page.tsx) and client
// (_OverviewTabs.tsx). Kept in its own module because Next.js does not
// allow importing non-component values from a "use client" module into
// a server component (causes runtime "TABS.map is not a function" when
// the proxy is destructured at module-load).

export const TABS = [
  { id: "overview", label: "Overview" },
  { id: "website",  label: "Website"  },
  { id: "portal",   label: "Portal"   },
  { id: "kanban",   label: "Kanban"   },
  { id: "finance",  label: "Finance"  },
  { id: "assets",   label: "Assets"   },
  { id: "sops",     label: "SOPs"     },
  { id: "files",    label: "Files"    },
  { id: "tools",    label: "Tools"    },
] as const;

export type TabId = (typeof TABS)[number]["id"];
