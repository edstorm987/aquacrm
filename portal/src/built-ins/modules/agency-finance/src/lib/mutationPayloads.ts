type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

/** A successful acknowledgement must itself be a JSON object. */
export function isFinanceMutationAck(value: unknown): value is JsonRecord & { ok: true } {
  return record(value)?.ok === true;
}

/**
 * Entity-bearing Finance responses drive local replacement/reset continuations.
 * Requiring a non-blank id stops truthy primitives, arrays and placeholder
 * objects from being mistaken for the record the server says it persisted.
 */
export function isFinanceMutationEntity(
  value: unknown,
  key: string,
): boolean {
  const payload = record(value);
  const entity = payload ? record(payload[key]) : null;
  return payload?.ok === true
    && typeof entity?.id === "string"
    && entity.id.trim().length > 0;
}

export function isFinanceMutationEntities(
  value: unknown,
  keys: readonly string[],
): boolean {
  return isFinanceMutationAck(value)
    && keys.every(key => isFinanceMutationEntity(value, key));
}

/** A returned navigation target must be an absolute HTTPS address. */
export function isFinanceMutationHttpsUrl(value: unknown, key = "url"): boolean {
  const payload = record(value);
  if (payload?.ok !== true || typeof payload[key] !== "string") return false;
  try {
    return new URL(payload[key]).protocol === "https:";
  } catch {
    return false;
  }
}
