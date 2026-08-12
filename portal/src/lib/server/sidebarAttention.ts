import "server-only";

import type { NavPanel } from "@/lib/chrome/sidebarLayout";
import type { OperationalAlert } from "@/lib/server/operationalAlerts";
import { destinationForOperationalAlert } from "@/lib/operationalAttention";

export function addSidebarAttention(panels: NavPanel[], alerts: OperationalAlert[]): NavPanel[] {
  const counts = new Map<string, number>();
  for (const alert of alerts) {
    const destination = destinationForOperationalAlert(alert);
    counts.set(destination, (counts.get(destination) ?? 0) + 1);
  }

  return panels.map(panel => ({
    ...panel,
    items: panel.items.map(item => {
      const attentionCount = counts.get(item.id) ?? 0;
      return attentionCount > 0 ? { ...item, attentionCount } : item;
    }),
  }));
}

export function destinationForAlert(alert: OperationalAlert): string {
  return destinationForOperationalAlert(alert);
}
