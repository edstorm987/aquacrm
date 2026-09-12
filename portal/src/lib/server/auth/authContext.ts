import "server-only";

import {
  authBrandContextMatchesAgency,
  authBrandForAgency,
  getAuthBrand,
  isKnownAuthBrandId,
  matchAuthBrandContextAgency,
  resolveAuthBrand,
  type ResolvedAuthBrand,
} from "@/lib/brands/authBrand";
import { getAgency, getClient, getClientForAgency, listAgencies } from "@/server/tenants";
import { getUserById } from "@/server/users";
import type { Agency, Client, ServerUser } from "@/server/types";
import type { PasswordResetPayload } from "./passwordReset";

const MAX_CONTEXT_LENGTH = 120;

function contextValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_CONTEXT_LENGTH) return undefined;
  return trimmed;
}

function exactIdValue(value: unknown): string | undefined {
  if (typeof value !== "string" || value !== value.trim()) return undefined;
  return value && value.length <= MAX_CONTEXT_LENGTH ? value : undefined;
}

function usableAgency(agency: Agency | null): agency is Agency {
  return agency?.status === "active";
}

function usableClient(client: Client | null): client is Client {
  return client !== null && (client.status === "active" || client.status === "suspended");
}

export interface ExactAuthContext {
  agency: Agency;
  client: Client | null;
  brand: ResolvedAuthBrand;
}

export interface PublicAuthContext {
  valid: boolean;
  requestedClientId?: string;
  exact?: ExactAuthContext;
  brand: ResolvedAuthBrand;
}

/**
 * Resolve public login/recovery presentation without treating it as access.
 * A supplied client id is retained as an opaque request context, but the page
 * receives exact tenant presentation only when the client and brand agree.
 */
export function resolvePublicAuthContext(input: {
  brand?: unknown;
  clientId?: unknown;
}): PublicAuthContext {
  const brandValue = contextValue(input.brand);
  const requestedClientId = exactIdValue(input.clientId);

  if (input.clientId !== undefined && !requestedClientId) {
    return { valid: false, brand: getAuthBrand(undefined) };
  }

  if (requestedClientId) {
    const client = getClient(requestedClientId);
    const agency = client ? getAgency(client.agencyId) : null;
    if (
      !usableClient(client)
      || !usableAgency(agency)
      || !authBrandContextMatchesAgency(brandValue, agency)
    ) {
      return {
        valid: false,
        requestedClientId,
        brand: getAuthBrand(undefined),
      };
    }
    const exact = { agency, client, brand: authBrandForAgency(agency) };
    return { valid: true, requestedClientId, exact, brand: exact.brand };
  }

  const brand = resolveAuthBrand(brandValue, listAgencies());
  const valid = !brandValue
    || brandValue.toLowerCase() === "aquacrm"
    || brand.id !== "aquacrm";
  return { valid, brand: valid ? brand : getAuthBrand(undefined) };
}

/**
 * Bind a signed-in subject to the requested brand/client context. The request
 * can narrow to one existing membership; it can never grant a membership or
 * silently fall back when an explicit tenant/client is wrong.
 */
export function resolveUserAuthContext(
  user: ServerUser,
  input: { brand?: unknown; clientId?: unknown } = {},
): ExactAuthContext | null {
  const brandValue = contextValue(input.brand);
  const requestedClientId = exactIdValue(input.clientId);
  if (input.clientId !== undefined && !requestedClientId) return null;
  if (input.brand !== undefined && typeof input.brand === "string" && input.brand.trim() && !brandValue) {
    return null;
  }

  const membershipIds = user.agencyIds?.length > 0 ? user.agencyIds : [user.agencyId];
  const activeMemberships = listAgencies().filter(
    agency => membershipIds.includes(agency.id) && agency.status === "active",
  );
  if (activeMemberships.length === 0) return null;

  let client: Client | null = null;
  if (requestedClientId) {
    if (user.clientId !== requestedClientId) return null;
    const row = getClient(requestedClientId);
    if (!row || !membershipIds.includes(row.agencyId)) return null;
    client = getClientForAgency(row.agencyId, requestedClientId);
    if (!usableClient(client)) return null;
  } else if (user.clientId) {
    const row = getClient(user.clientId);
    if (!row || !membershipIds.includes(row.agencyId)) return null;
    client = getClientForAgency(row.agencyId, user.clientId);
    if (!usableClient(client)) return null;
  }

  let agency = client
    ? activeMemberships.find(candidate => candidate.id === client!.agencyId) ?? null
    : null;
  if (!agency && brandValue && !isKnownAuthBrandId(brandValue.toLowerCase())) {
    const matched = matchAuthBrandContextAgency(brandValue, activeMemberships);
    agency = matched
      ? activeMemberships.find(candidate => candidate.id === matched.id) ?? null
      : null;
    if (!agency) return null;
  }
  if (!agency) {
    agency = activeMemberships.find(candidate => candidate.id === user.agencyId) ?? null;
  }
  if (!agency || (client && client.agencyId !== agency.id)) return null;
  if (!authBrandContextMatchesAgency(brandValue, agency)) return null;

  return { agency, client, brand: authBrandForAgency(agency) };
}

/** Resolve presentation from the signed reset bearer, never from its URL. */
export function resolvePasswordResetAuthContext(
  payload: PasswordResetPayload,
): ExactAuthContext | null {
  const user = getUserById(payload.userId);
  if (
    !user
    || user.email !== payload.email
    || (user.sessionRev ?? 0) !== payload.sessionRev
    || (user.clientId ?? null) !== payload.clientId
  ) return null;
  return resolveUserAuthContext(user, {
    brand: payload.contextAgencyId ?? undefined,
    clientId: payload.clientId ?? undefined,
  });
}
