export type StoragePatchOperation =
  | { op: "set"; path: string[]; value: unknown }
  | { op: "delete"; path: string[] }
  | { op: "merge_object"; path: string[]; value: Record<string, unknown> }
  | { op: "append_unique"; path: string[]; value: unknown };

type JsonObject = Record<string, unknown>;

// PostgreSQL applies each jsonb_set against the complete datastore value. A
// Radar sweep can update hundreds of leaves in one agency branch, so sending
// every leaf separately turns a small logical write into hundreds of full
// JSONB rewrites. Compact only busy nested branches; sibling agencies and
// unrelated collections remain independently mergeable.
const MAX_PATCH_OPERATIONS_PER_BRANCH = 64;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function mergeObject(current: JsonObject, incoming: JsonObject): JsonObject {
  const merged: JsonObject = clone(current);
  for (const [key, value] of Object.entries(incoming)) {
    const existing = merged[key];
    merged[key] = isObject(existing) && isObject(value)
      ? mergeObject(existing, value)
      : clone(value);
  }
  return merged;
}

export function diffStorageValue(
  before: unknown,
  after: unknown,
  path: string[] = [],
): StoragePatchOperation[] {
  if (equal(before, after)) return [];
  if (after === undefined) return [{ op: "delete", path }];

  if (Array.isArray(before) && Array.isArray(after)) {
    const isAppend =
      after.length > before.length &&
      before.every((value, index) => equal(value, after[index]));
    if (isAppend) {
      return after
        .slice(before.length)
        .map(value => ({ op: "append_unique" as const, path, value: clone(value) }));
    }
    return [{ op: "set", path, value: clone(after) }];
  }

  if (isObject(before) && isObject(after)) {
    // PostgreSQL jsonb_set cannot create a missing intermediate object. Merge
    // a newly populated top-level collection at its root so its first record
    // persists WITHOUT replacing a different first record committed by another
    // process from the same empty snapshot.
    if (path.length === 1 && Object.keys(before).length === 0 && Object.keys(after).length > 0) {
      return [{ op: "merge_object", path, value: clone(after) }];
    }
    const operations: StoragePatchOperation[] = [];
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      operations.push(...diffStorageValue(before[key], after[key], [...path, key]));
    }
    if (path.length >= 2 && operations.length > MAX_PATCH_OPERATIONS_PER_BRANCH) {
      return [{ op: "set", path, value: clone(after) }];
    }
    return operations;
  }

  return [{ op: "set", path, value: clone(after) }];
}

function getAtPath(target: unknown, path: string[]): unknown {
  let current = target;
  for (const segment of path) {
    if (!isObject(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function parentAtPath(target: JsonObject, path: string[]): JsonObject {
  let current = target;
  for (const segment of path.slice(0, -1)) {
    const child = current[segment];
    if (!isObject(child)) current[segment] = {};
    current = current[segment] as JsonObject;
  }
  return current;
}

export function applyStoragePatch<T>(target: T, operations: StoragePatchOperation[]): T {
  let result = clone(target) as unknown;

  for (const operation of operations) {
    if (operation.path.length === 0) {
      if (operation.op === "set") result = clone(operation.value);
      continue;
    }
    if (!isObject(result)) result = {};
    const parent = parentAtPath(result as JsonObject, operation.path);
    const key = operation.path.at(-1)!;

    if (operation.op === "delete") {
      delete parent[key];
      continue;
    }
    if (operation.op === "set") {
      parent[key] = clone(operation.value);
      continue;
    }
    if (operation.op === "merge_object") {
      const current = getAtPath(result, operation.path);
      parent[key] = mergeObject(isObject(current) ? current : {}, operation.value);
      continue;
    }

    const current = getAtPath(result, operation.path);
    const values = Array.isArray(current) ? current : [];
    if (!values.some(value => equal(value, operation.value))) {
      parent[key] = [...values, clone(operation.value)];
    }
  }

  return result as T;
}
