/** Prefer the access kernel's human sentence over its machine-readable code. */
export function apiResponseError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return fallback;
  const body = payload as { message?: unknown; error?: unknown };
  if (typeof body.message === "string" && body.message.trim()) return body.message.trim();
  if (typeof body.error === "string" && body.error.trim()) return body.error.trim();
  return fallback;
}
