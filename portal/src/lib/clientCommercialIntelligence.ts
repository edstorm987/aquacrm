export interface ClientServiceExpansionSummary {
  assignmentChanges: number;
  upsellCount: number;
  latestExpansionAt?: number;
  latestProductNames: string[];
}

interface AssignmentHistoryEntry {
  selectedProductIds: string[];
  addedProductIds: string[];
  addedProductNames: string[];
  assignedAt?: number;
  changeType?: string;
}

export function summariseClientServiceExpansion(value: unknown): ClientServiceExpansionSummary {
  if (!Array.isArray(value)) return { assignmentChanges: 0, upsellCount: 0, latestProductNames: [] };
  const history = value.flatMap(cleanHistoryEntry);
  let previousIds = new Set<string>();
  const expansions = history.flatMap((entry, index) => {
    const inferredAdded = entry.selectedProductIds.filter(id => !previousIds.has(id));
    const addedProductIds = entry.addedProductIds.length ? entry.addedProductIds : inferredAdded;
    previousIds = new Set(entry.selectedProductIds);
    const isExpansion = index > 0 && (entry.changeType === "upsell" || addedProductIds.length > 0);
    return isExpansion ? [{ ...entry, addedProductIds }] : [];
  });
  const latest = [...expansions].sort((a, b) => (b.assignedAt ?? 0) - (a.assignedAt ?? 0))[0];
  return {
    assignmentChanges: history.length,
    upsellCount: expansions.length,
    latestExpansionAt: latest?.assignedAt,
    latestProductNames: latest?.addedProductNames ?? [],
  };
}

function cleanHistoryEntry(value: unknown): AssignmentHistoryEntry[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const row = value as Record<string, unknown>;
  return [{
    selectedProductIds: cleanIds(row.selectedProductIds),
    addedProductIds: cleanIds(row.addedProductIds),
    addedProductNames: cleanStrings(row.addedProductNames),
    assignedAt: typeof row.assignedAt === "number" && Number.isFinite(row.assignedAt) ? row.assignedAt : undefined,
    changeType: typeof row.changeType === "string" ? row.changeType : undefined,
  }];
}

function cleanIds(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map(item => item.trim()))]
    : [];
}

function cleanStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map(item => item.trim()).slice(0, 24)
    : [];
}
