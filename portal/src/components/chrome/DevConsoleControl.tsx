import "server-only";

import { DevConsoleButton } from "@/components/chrome/DevConsoleButton";
import { devConsoleBadge } from "@/lib/server/devConsoleStatus";

// Server half of the topbar Dev Console — the `RadarQuickLookControl` shape:
// read the live number here, hand the client button a real starting value.
//
// Only the CHEAP badge read happens on the render path (open findings + open
// blockers, TTL-cached). The expensive live scan is behind the console's own
// route and runs only when the popover is opened.
//
// Visibility is decided by the caller: the layout renders this at all only when
// `canUseDevMode() && effectiveRole(session).isFounder`. That is a server
// decision by design — the icon can never be summoned client-side.
export async function DevConsoleControl() {
  return <DevConsoleButton initialBadge={await devConsoleBadge()} />;
}
