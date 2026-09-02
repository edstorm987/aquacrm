import type { Billing, Subscription } from "./domain";
import { assertSubscription } from "./runtimeValidation";

export interface MembershipPortalMutationResult {
  ok: true;
  url: string;
}

export interface MembershipCancelMutationResult {
  ok: true;
  subscription: Subscription;
  requestOperationId: string;
}

export type MembershipSubscribeMutationResult =
  | { ok: true; mode: "checkout"; checkoutUrl: string; operationId: string; requestOperationId: string; planId: string; billing: Billing }
  | { ok: true; mode: "free" | "changed"; subscription: Subscription; operationId: string; requestOperationId: string; planId: string; billing: Billing };

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonBlankText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Provider-hosted destinations are absolute HTTPS URLs with no credentials. */
export function isHttpsProviderNavigationUrl(value: unknown): value is string {
  if (!nonBlankText(value) || value !== value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isSubscription(value: unknown): value is Subscription {
  const body = record(value);
  if (!body) return false;
  try {
    assertSubscription(body as unknown as Subscription);
    return true;
  } catch {
    return false;
  }
}

export function isMembershipPortalMutationResult(
  value: unknown,
): value is MembershipPortalMutationResult {
  const body = record(value);
  return body?.ok === true && isHttpsProviderNavigationUrl(body.url);
}

export function isMembershipCancelMutationResult(
  value: unknown,
  expected: Pick<Subscription, "id" | "planId" | "billing"> & { requestOperationId: string },
): value is MembershipCancelMutationResult {
  const body = record(value);
  if (body?.ok !== true || !isSubscription(body.subscription)) return false;
  return body.requestOperationId === expected.requestOperationId
    && body.subscription.id === expected.id
    && body.subscription.planId === expected.planId
    && body.subscription.billing === expected.billing
    && (body.subscription.status === "canceled" || body.subscription.cancelAtPeriodEnd);
}

export function isMembershipSubscribeMutationResult(
  value: unknown,
  expected: { requestOperationId: string; planId: string; billing: Billing },
): value is MembershipSubscribeMutationResult {
  const body = record(value);
  if (
    body?.ok !== true
    || !nonBlankText(body.operationId)
    || body.requestOperationId !== expected.requestOperationId
    || body.planId !== expected.planId
    || body.billing !== expected.billing
  ) return false;
  if (body.mode === "checkout") return isHttpsProviderNavigationUrl(body.checkoutUrl);
  if (body.mode === "free" || body.mode === "changed") {
    return isSubscription(body.subscription)
      && body.subscription.planId === expected.planId
      && body.subscription.billing === expected.billing;
  }
  return false;
}
