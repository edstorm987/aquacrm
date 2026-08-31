// Wire: You-Deserve-It (client delight) spend → a Finance expense.
//
// A delight that has been PLANNED with money against it (a budget, or a logged
// cost) records that spend as an approval-gated ("pending") finance expense, so
// the commitment shows up in the money-out picture *before* it is spent rather
// than only after. Idempotent on the delight id (via the expense `reference`),
// and while the expense is still pending its amount tracks the delight's own
// number. Supplier and occasion are carried through to the expense's vendor and
// reason so Finance can see what it is signing off.
//
// Record + surface only — the app never moves money. What the sign-off buys is
// the other direction: `delightExpenseState` reports whether Finance approved
// the spend, and the client-delight route refuses to move a gift to "ordered"
// until it did. Spending is a confirmed human action, twice over.
//
// The hook lives in the client-delight route (async); the idempotency, the
// create and the approval read live here in the Finance lane.
// `clientDelight.ts` itself is untouched.

import "server-only";

import type { AgencyFinanceContainer } from "@/built-ins/modules/agency-finance/src/server";
import { containerFor } from "@/built-ins/modules/agency-finance/src/server/foundationAdapter";
import { ensureAgencyFinanceFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/agencyFinanceFoundation";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { getInstall } from "@/server/pluginInstalls";
import type { ClientDelightOccasion, ClientDelightRecord, ClientDelightStatus } from "@/server/types";

export interface DelightExpenseInput {
  clientId?: string;
  title: string;
  amountCents: number;
  delightId: string;
  supplier?: string;
  occasion?: ClientDelightOccasion;
}

export interface DelightExpenseState {
  id: string;
  status: "pending" | "approved" | "reimbursed" | "rejected";
  amountCents: number;
}

export const delightExpenseReference = (delightId: string): string => `delight:${delightId}`;

// A delight carries a money commitment from the moment it is PLANNED — before
// that it is only an idea, and once cancelled it is not a commitment at all.
const SPEND_STATUSES: ReadonlySet<ClientDelightStatus> = new Set<ClientDelightStatus>(["planned", "ordered", "sent", "delivered"]);

// What this delight commits: the logged actual if there is one, otherwise the
// planned budget. Zero when there is no money against it (or it is not yet a
// commitment), which makes every caller below a safe no-op.
export function delightSpendCents(record: Pick<ClientDelightRecord, "status" | "costCents" | "budgetCents">): number {
  if (!SPEND_STATUSES.has(record.status)) return 0;
  const amount = record.costCents ?? record.budgetCents ?? 0;
  return amount > 0 ? amount : 0;
}

// An expense only clears a purchase once a human approved it. "reimbursed"
// counts — it is approved and already paid out.
export const delightSpendApproved = (state: DelightExpenseState | null): boolean =>
  state?.status === "approved" || state?.status === "reimbursed";

// Testable core: record the delight's spend as a pending (approval-gated)
// expense on a supplied finance container. Idempotent on the delight id, so a
// re-saved delight never double-records; while the expense is still pending its
// amount is kept in step with the delight. An already-approved expense is left
// exactly as approved — re-pricing a signed-off number behind Finance's back
// would claim an approval that never happened. Returns the expense id, or null
// when there's nothing to record / no usable category.
export async function recordDelightExpenseInContainer(
  finance: AgencyFinanceContainer,
  input: DelightExpenseInput,
  actor: string,
): Promise<string | null> {
  if (!input.delightId || !(input.amountCents > 0)) return null;
  const reference = delightExpenseReference(input.delightId);
  const existing = (await finance.expenses.list()).find(expense => expense.reference === reference);
  if (existing) {
    if (existing.status === "pending" && existing.amountCents !== input.amountCents) {
      await finance.expenses.update(existing.id, { amountCents: input.amountCents }, actor);
    }
    return existing.id; // already recorded — idempotent
  }

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
    vendor: input.supplier || undefined,
    reason: `You Deserve It — ${input.occasion ?? "recognition"}`,
    reference,
    incurredAt: Date.now(),
    // recordAsPaid omitted → status "pending" (approval-gated, per the plan).
  }, actor);
  return expense.id;
}

// Testable core: what Finance currently says about this delight's spend. Null
// when nothing has been recorded for it — which is an absence of evidence, not
// an approval, so callers must treat it as "not approved".
export async function delightExpenseStateInContainer(
  finance: AgencyFinanceContainer,
  delightId: string,
): Promise<DelightExpenseState | null> {
  if (!delightId) return null;
  const reference = delightExpenseReference(delightId);
  const expense = (await finance.expenses.list()).find(item => item.reference === reference);
  return expense ? { id: expense.id, status: expense.status, amountCents: expense.amountCents } : null;
}

function financeContainer(agencyId: string): AgencyFinanceContainer | null {
  const install = getInstall({ agencyId }, "agency-finance");
  if (!install?.enabled) return null;
  ensureAgencyFinanceFoundationRegistered();
  return containerFor({ agencyId, storage: makePluginStorage(install.id) as never, install });
}

// Foundation wrapper: resolve the agency's finance install + container, then
// record. A no-op (returns null) when Finance isn't connected — never throws
// the delight flow.
export async function recordDelightExpense(agencyId: string, input: DelightExpenseInput, actor: string): Promise<string | null> {
  const finance = financeContainer(agencyId);
  if (!finance) return null;
  return recordDelightExpenseInContainer(finance, input, actor);
}

// Foundation wrapper for the approval read. Returns null when Finance isn't
// connected — the caller must then NOT claim the spend was approved, and must
// not pretend Finance refused it either; there is simply no sign-off surface.
export async function delightExpenseState(agencyId: string, delightId: string): Promise<DelightExpenseState | null> {
  const finance = financeContainer(agencyId);
  if (!finance) return null;
  return delightExpenseStateInContainer(finance, delightId);
}
