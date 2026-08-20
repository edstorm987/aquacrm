// Wire: You-Deserve-It (client delight) spend → a Finance expense.
//
// When a delight is delivered with a cost, record that cost as an
// approval-gated ("pending") finance expense, so gift spend shows up in the
// money-out picture without being double-counted. Idempotent on the delight id
// (via the expense `reference`). Record + surface only — the app never moves
// money; this reflects a spend that already happened.
//
// The hook lives in the client-delight route (async); the idempotency + create
// live here in the Finance lane. `clientDelight.ts` itself is untouched.

import "server-only";

import type { AgencyFinanceContainer } from "@/built-ins/modules/agency-finance/src/server";
import { containerFor } from "@/built-ins/modules/agency-finance/src/server/foundationAdapter";
import { ensureAgencyFinanceFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/agencyFinanceFoundation";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { getInstall } from "@/server/pluginInstalls";

export interface DelightExpenseInput {
  clientId?: string;
  title: string;
  amountCents: number;
  delightId: string;
}

export const delightExpenseReference = (delightId: string): string => `delight:${delightId}`;

// Testable core: record the delight's cost as a pending (approval-gated)
// expense on a supplied finance container. Idempotent on the delight id, so a
// re-delivered/re-saved delight never double-records. Returns the expense id,
// or null when there's nothing to record / no usable category.
export async function recordDelightExpenseInContainer(
  finance: AgencyFinanceContainer,
  input: DelightExpenseInput,
  actor: string,
): Promise<string | null> {
  if (!input.delightId || !(input.amountCents > 0)) return null;
  const reference = delightExpenseReference(input.delightId);
  const existing = (await finance.expenses.list()).find(expense => expense.reference === reference);
  if (existing) return existing.id; // already recorded — idempotent

  const categories = await finance.categories.list();
  const category =
    categories.find(cat => cat.status === "active" && /gift|delight|marketing/i.test(cat.name))
    ?? categories.find(cat => cat.status === "active" && cat.name === "Other")
    ?? categories.find(cat => cat.status === "active");
  if (!category) return null;

  const expense = await finance.expenses.create({
    categoryId: category.id,
    amountCents: input.amountCents,
    clientId: input.clientId,
    currency: "gbp",
    description: `Client delight: ${input.title}`,
    reference,
    incurredAt: Date.now(),
    // recordAsPaid omitted → status "pending" (approval-gated, per the plan).
  }, actor);
  return expense.id;
}

// Foundation wrapper: resolve the agency's finance install + container, then
// record. A no-op (returns null) when Finance isn't connected — never throws
// the delight flow.
export async function recordDelightExpense(agencyId: string, input: DelightExpenseInput, actor: string): Promise<string | null> {
  const install = getInstall({ agencyId }, "agency-finance");
  if (!install?.enabled) return null;
  ensureAgencyFinanceFoundationRegistered();
  const finance = containerFor({ agencyId, storage: makePluginStorage(install.id) as never, install });
  return recordDelightExpenseInContainer(finance, input, actor);
}
