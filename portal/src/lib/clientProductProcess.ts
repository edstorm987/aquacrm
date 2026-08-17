export interface ClientProductStageHistoryEntry {
  stageId: string;
  enteredAt: number;
  exitedAt?: number;
  actor?: string;
}

export interface ClientProductProcessEntry {
  completedStepIds: string[];
  currentStageId?: string;
  stageHistory?: ClientProductStageHistoryEntry[];
  updatedAt?: number;
  updatedBy?: string;
}

export type ClientProductProcessState = Record<string, ClientProductProcessEntry>;

export function cleanClientProductProcessState(value: unknown): ClientProductProcessState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.entries(value as Record<string, unknown>).reduce<ClientProductProcessState>((state, [rawProductId, rawEntry]) => {
    const productId = cleanId(rawProductId);
    if (!productId || !rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) return state;
    const entry = rawEntry as Partial<ClientProductProcessEntry>;
    const currentStageId = cleanId(entry.currentStageId);
    const stageHistory = cleanStageHistory(entry.stageHistory);
    state[productId] = {
      completedStepIds: cleanIds(entry.completedStepIds, 96),
      ...(currentStageId ? { currentStageId } : {}),
      ...(stageHistory.length ? { stageHistory } : {}),
      updatedAt: cleanTimestamp(entry.updatedAt),
      updatedBy: cleanText(entry.updatedBy, 320),
    };
    return state;
  }, {});
}

export function setClientProductStepCompletion(
  state: ClientProductProcessState,
  productId: string,
  stepId: string,
  completed: boolean,
  actor: string,
  now = Date.now(),
): ClientProductProcessState {
  const cleanProductId = cleanId(productId);
  const cleanStepId = cleanId(stepId);
  const cleanedState = cleanClientProductProcessState(state);
  if (!cleanProductId || !cleanStepId) return cleanedState;
  const current = cleanedState[cleanProductId] ?? { completedStepIds: [] };
  const completedStepIds = completed
    ? [...new Set([...current.completedStepIds, cleanStepId])]
    : current.completedStepIds.filter(id => id !== cleanStepId);
  return {
    ...cleanedState,
    [cleanProductId]: {
      ...current,
      completedStepIds: completedStepIds.slice(0, 96),
      updatedAt: now,
      updatedBy: cleanText(actor, 320),
    },
  };
}

export function setClientProductStage(
  state: ClientProductProcessState,
  productId: string,
  stageId: string,
  actor: string,
  now = Date.now(),
): ClientProductProcessState {
  const cleanProductId = cleanId(productId);
  const cleanStageId = cleanId(stageId);
  const cleanedState = cleanClientProductProcessState(state);
  if (!cleanProductId || !cleanStageId) return cleanedState;
  const current = cleanedState[cleanProductId] ?? { completedStepIds: [] };
  const currentHistory = current.stageHistory ?? [];
  const previousStageId = current.currentStageId;
  let stageHistory = currentHistory;
  if (previousStageId === cleanStageId) {
    if (!currentHistory.some(entry => entry.stageId === cleanStageId && !entry.exitedAt)) {
      stageHistory = [...currentHistory, {
        stageId: cleanStageId,
        enteredAt: current.updatedAt ?? now,
        actor: cleanText(actor, 320),
      }].slice(-96);
    }
  } else {
    const closedHistory = currentHistory.map(entry => !entry.exitedAt ? { ...entry, exitedAt: now } : entry);
    const legacyPrevious = previousStageId && !currentHistory.some(entry => entry.stageId === previousStageId)
      ? [{ stageId: previousStageId, enteredAt: current.updatedAt ?? now, exitedAt: now, actor: current.updatedBy }]
      : [];
    stageHistory = [...closedHistory, ...legacyPrevious, {
      stageId: cleanStageId,
      enteredAt: now,
      actor: cleanText(actor, 320),
    }].slice(-96);
  }
  return {
    ...cleanedState,
    [cleanProductId]: {
      ...current,
      currentStageId: cleanStageId,
      stageHistory,
      updatedAt: now,
      updatedBy: cleanText(actor, 320),
    },
  };
}

export function clientProductStageElapsedMs(
  entry: ClientProductProcessEntry | undefined,
  stageId: string | undefined,
  now = Date.now(),
): number | null {
  if (!entry || !stageId) return null;
  const history = entry.stageHistory ?? [];
  const intervals = history.filter(item => item.stageId === stageId);
  if (!intervals.length) {
    return entry.currentStageId === stageId && entry.updatedAt ? Math.max(0, now - entry.updatedAt) : null;
  }
  return intervals.reduce((total, item) => total + Math.max(0, (item.exitedAt ?? now) - item.enteredAt), 0);
}

export function longestActiveClientProductStage(
  state: ClientProductProcessState,
  now = Date.now(),
): { productId: string; stageId: string; elapsedMs: number } | null {
  return Object.entries(cleanClientProductProcessState(state)).reduce<{ productId: string; stageId: string; elapsedMs: number } | null>((longest, [productId, entry]) => {
    if (!entry.currentStageId) return longest;
    const elapsedMs = clientProductStageElapsedMs(entry, entry.currentStageId, now) ?? 0;
    return !longest || elapsedMs > longest.elapsedMs ? { productId, stageId: entry.currentStageId, elapsedMs } : longest;
  }, null);
}

function cleanStageHistory(value: unknown): ClientProductStageHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Partial<ClientProductStageHistoryEntry>;
    const stageId = cleanId(row.stageId);
    const enteredAt = cleanTimestamp(row.enteredAt);
    if (!stageId || !enteredAt) return [];
    const exitedAt = cleanTimestamp(row.exitedAt);
    return [{
      stageId,
      enteredAt,
      ...(exitedAt && exitedAt >= enteredAt ? { exitedAt } : {}),
      actor: cleanText(row.actor, 320),
    }];
  }).slice(-96);
}

function cleanIds(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap(item => {
    const id = cleanId(item);
    return id ? [id] : [];
  }))].slice(0, limit);
}

function cleanId(value: unknown): string | undefined {
  return cleanText(value, 160);
}

function cleanText(value: unknown, limit: number): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : undefined;
}

function cleanTimestamp(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}
