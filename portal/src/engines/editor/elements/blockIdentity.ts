/** Safe identity contract shared by persistence validation and CSS renderers. */

const SAFE_BLOCK_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SAFE_BLOCK_TYPE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

export function isSafeBlockId(value: unknown): value is string {
  return typeof value === "string" && SAFE_BLOCK_ID.test(value);
}

export function isSafeBlockType(value: unknown): value is string {
  return typeof value === "string" && SAFE_BLOCK_TYPE.test(value);
}

/**
 * Return an identifier safe to interpolate into quoted attribute selectors
 * and keyframe names. A bad draft may still render its React node, but never
 * receives attacker-authored CSS text.
 */
export function blockCssScopeId(prefix: string, blockId: unknown): string | null {
  if (!isSafeBlockId(blockId) || !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(prefix)) return null;
  return `${prefix}-${blockId}`;
}

