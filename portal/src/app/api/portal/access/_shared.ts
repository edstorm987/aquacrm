import "server-only";

import { AccessControlError } from "@/server/accessControl";

export async function readAccessJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new AccessControlError(400, "invalid_json_body");
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AccessControlError) throw error;
    throw new AccessControlError(400, "invalid_json_body");
  }
}

export function optionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new AccessControlError(400, "invalid_string_field");
  return value;
}

export function optionalNumber(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new AccessControlError(400, "invalid_number_field");
  }
  return value;
}
