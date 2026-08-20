// Tab metadata — shared between server (page.tsx) and client
// (_OverviewTabs.tsx). Kept in its own module because Next.js does not
// allow importing non-component values from a "use client" module into
// a server component (causes runtime "TABS.map is not a function" when
// the proxy is destructured at module-load).

import {
  CLIENT_WORKSPACE_TABS,
  type ClientWorkspaceTabId,
} from "@/lib/clients/clientWorkspace";

export const TABS = CLIENT_WORKSPACE_TABS;
export type TabId = ClientWorkspaceTabId;
