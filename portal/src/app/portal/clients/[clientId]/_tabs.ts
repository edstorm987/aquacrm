// Tab metadata — shared between server (page.tsx) and client
// (_OverviewTabs.tsx). Kept in its own module because Next.js does not
// allow importing non-component values from a "use client" module into
// a server component (causes runtime "TABS.map is not a function" when
// the proxy is destructured at module-load).

export const TABS = [
  { id: "overview", label: "Overview" },
  { id: "website",  label: "Website"  },
  { id: "fulfilment", label: "Fulfilment" },
  { id: "properties", label: "Properties" },
  { id: "kanban",   label: "Kanban"   },
  { id: "finance",  label: "Finance"  },
  { id: "assets",   label: "Assets"   },
  { id: "sops",     label: "SOPs"     },
  { id: "files",    label: "Files"    },
  { id: "systems",  label: "Systems"  },
] as const;

export type TabId = (typeof TABS)[number]["id"];
