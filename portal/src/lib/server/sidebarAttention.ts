import "server-only";

import type { NavPanel } from "@/lib/chrome/sidebarLayout";
import { destinationForOperationalAlert, type OperationalAlert } from "@/lib/intelligence/operationalAttention";

export function addSidebarAttention(panels: NavPanel[], alerts: OperationalAlert[]): NavPanel[] {
  const counts = new Map<string, number>();
  for (const alert of alerts) {
    const destination = destinationForOperationalAlert(alert);
    counts.set(destination, (counts.get(destination) ?? 0) + 1);
  }

  // Roll hidden panels up onto the single "Operations" row. The Operations
  // functions (Fulfilment, Finance, Marketing, Journey, Staff…) render as cards
  // on the hub, not as sidebar rows — they live in a hidden, search-only panel.
  // Their alert badges would otherwise vanish, so we aggregate them onto the
  // one visible "operations-home" row that lands on the hub. (No-op when there
  // is no hidden panel or no Operations row, e.g. client/customer scope.)
  let operationsRollup = 0;
  for (const panel of panels) {
    if (!panel.hidden) continue;
    for (const item of panel.items) operationsRollup += counts.get(item.id) ?? 0;
  }

  return panels.map(panel => ({
    ...panel,
    items: panel.items.map(item => {
      let attentionCount = counts.get(item.id) ?? 0;
      if (item.id === "operations-home") attentionCount += operationsRollup;
      return attentionCount > 0 ? { ...item, attentionCount } : item;
    }),
  }));
}

export function destinationForAlert(alert: OperationalAlert): string {
  return destinationForOperationalAlert(alert);
}
