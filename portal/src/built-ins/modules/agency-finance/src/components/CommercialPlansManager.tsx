"use client";

import Link from "next/link";
import { useState } from "react";

import { addBusinessCalendarDays } from "@/lib/shared/formatDateTime";
import type { CommercialPlanAssignment, Plan } from "../lib/domain";
import { SUPPORTED_CURRENCIES } from "../lib/currencies";

interface ClientOption {
  id: string;
  name: string;
}

function operationId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `${prefix}:${crypto.randomUUID()}`;
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

function firstDueDate(): string {
  return addBusinessCalendarDays(7);
}

export function CommercialPlansManager({
  apiBase,
  initialPlans,
  assignments,
  clients,
}: {
  apiBase: string;
  initialPlans: Plan[];
  assignments: CommercialPlanAssignment[];
  clients: ClientOption[];
}) {
  const [plans, setPlans] = useState(initialPlans);
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [financePlanId, setFinancePlanId] = useState(initialPlans.find(plan => plan.active)?.id ?? "");
  const [dueAt, setDueAt] = useState(firstDueDate);
  const [moveTargets, setMoveTargets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function updatePlan(plan: Plan) {
    setBusy(plan.id);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/plans/update?id=${encodeURIComponent(plan.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: plan.label,
          monthlyAmountCents: plan.monthlyAmountCents,
          currency: plan.currency,
          lockInMonths: plan.lockInMonths,
          lockInFeeCents: plan.lockInFeeCents,
          active: plan.active,
        }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; plan?: Plan } | null;
      if (!response.ok || !payload?.ok || !payload.plan) throw new Error(payload?.error ?? "Plan could not be updated.");
      setPlans(current => current.map(item => item.id === payload.plan?.id ? payload.plan : item));
      setNotice("Plan template saved. Existing client schedules keep their snapshotted terms.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Plan could not be updated.");
    } finally {
      setBusy(null);
    }
  }

  async function assign(targetClientId: string, targetPlanId: string, targetDueAt: string) {
    if (!targetClientId || !targetPlanId || !targetDueAt) {
      setNotice("Choose a client, plan and first due date.");
      return;
    }
    setBusy(`assign:${targetClientId}`);
    setNotice(null);
    try {
      const response = await fetch("/api/tenants/client-payment-plans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: targetClientId,
          action: "assign-finance-plan",
          financePlanId: targetPlanId,
          firstDueAt: Date.parse(targetDueAt),
          customerVisible: true,
          operationId: operationId("commercial-plan-assign"),
        }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error ?? "Plan could not be assigned.");
      window.location.reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Plan could not be assigned.");
      setBusy(null);
    }
  }

  async function cancel(assignment: CommercialPlanAssignment) {
    setBusy(`cancel:${assignment.clientId}`);
    setNotice(null);
    try {
      const response = await fetch("/api/tenants/client-payment-plans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: assignment.clientId,
          action: "cancel-finance-plan",
          operationId: operationId("commercial-plan-cancel"),
        }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error ?? "Plan could not be cancelled.");
      window.location.reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Plan could not be cancelled.");
      setBusy(null);
    }
  }

  function patchPlan(id: string, patch: Partial<Plan>) {
    setPlans(current => current.map(plan => plan.id === id ? { ...plan, ...patch } : plan));
  }

  const activePlans = plans.filter(plan => plan.active);
  return (
    <div className="space-y-8">
      {notice ? <p role="status" className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">{notice}</p> : null}

      <section className="space-y-3">
        <div><h2 className="text-base font-semibold text-black/85">Plan templates</h2><p className="mt-1 text-sm text-black/50">Templates price future assignments. Saving one never reprices an existing client schedule.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="border-b border-black/10 text-left text-[11px] uppercase tracking-wide text-black/45"><tr><th className="py-2">Tier</th><th>Label</th><th>Monthly pence</th><th>Currency</th><th>Term</th><th>Deposit pence</th><th>Assigned</th><th>Active</th><th /></tr></thead>
            <tbody>{plans.map(plan => {
              const count = assignments.filter(assignment => assignment.financePlanId === plan.id).length;
              return <tr key={plan.id} className="border-b border-black/[0.07]">
                <td className="py-3 capitalize">{plan.tier}</td>
                <td><input aria-label={`${plan.label} label`} value={plan.label} onChange={event => patchPlan(plan.id, { label: event.target.value })} className="min-h-9 rounded-md border border-black/15 px-2" /></td>
                <td><input aria-label={`${plan.label} monthly pence`} type="number" min={0} value={plan.monthlyAmountCents} onChange={event => patchPlan(plan.id, { monthlyAmountCents: Number(event.target.value) })} className="min-h-9 w-28 rounded-md border border-black/15 px-2" /></td>
                <td><select aria-label={`${plan.label} currency`} value={plan.currency} onChange={event => patchPlan(plan.id, { currency: event.target.value as Plan["currency"] })} className="min-h-9 rounded-md border border-black/15 px-2 uppercase">{SUPPORTED_CURRENCIES.map(currency => <option key={currency.code} value={currency.code}>{currency.code}</option>)}</select></td>
                <td><input aria-label={`${plan.label} minimum term`} type="number" min={0} max={36} value={plan.lockInMonths} onChange={event => patchPlan(plan.id, { lockInMonths: Number(event.target.value) })} className="min-h-9 w-20 rounded-md border border-black/15 px-2" /></td>
                <td><input aria-label={`${plan.label} deposit pence`} type="number" min={0} value={plan.lockInFeeCents} onChange={event => patchPlan(plan.id, { lockInFeeCents: Number(event.target.value) })} className="min-h-9 w-28 rounded-md border border-black/15 px-2" /></td>
                <td>{count}</td>
                <td><input aria-label={`${plan.label} active`} type="checkbox" checked={plan.active} onChange={event => patchPlan(plan.id, { active: event.target.checked })} /></td>
                <td className="text-right"><button type="button" disabled={busy === plan.id} onClick={() => void updatePlan(plan)} className="min-h-9 rounded-md border border-black/15 px-3 text-xs font-semibold disabled:opacity-50">{busy === plan.id ? "Saving…" : "Save"}</button></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <div><h2 className="text-base font-semibold text-black/85">Assign a client</h2><p className="mt-1 text-sm text-black/50">Assignment creates the client&apos;s canonical payment schedule. Moving creates a new schedule and cancels the old one without changing its invoices.</p></div>
        <div className="grid gap-3 rounded-md border border-black/10 bg-black/[0.018] p-4 md:grid-cols-[1fr_1fr_180px_auto]">
          <label className="grid gap-1 text-xs font-medium text-black/55">Client<select value={clientId} onChange={event => setClientId(event.target.value)} className="min-h-10 rounded-md border border-black/15 bg-white px-3"><option value="">Choose client</option>{clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
          <label className="grid gap-1 text-xs font-medium text-black/55">Plan<select value={financePlanId} onChange={event => setFinancePlanId(event.target.value)} className="min-h-10 rounded-md border border-black/15 bg-white px-3"><option value="">Choose plan</option>{activePlans.map(plan => <option key={plan.id} value={plan.id}>{plan.label} · {plan.currency.toUpperCase()}</option>)}</select></label>
          <label className="grid gap-1 text-xs font-medium text-black/55">First due<input type="date" value={dueAt} onChange={event => setDueAt(event.target.value)} className="min-h-10 rounded-md border border-black/15 bg-white px-3" /></label>
          <button type="button" disabled={Boolean(busy)} onClick={() => void assign(clientId, financePlanId, dueAt)} className="self-end min-h-10 rounded-md bg-black px-4 text-sm font-semibold text-white disabled:opacity-50">Assign</button>
        </div>
      </section>

      <section className="space-y-3">
        <div><h2 className="text-base font-semibold text-black/85">Active client schedules</h2><p className="mt-1 text-sm text-black/50">These rows—not the template&apos;s legacy client list—feed MRR, Deposits, Customer Billing and invoice collection.</p></div>
        {assignments.length ? <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-sm"><thead className="border-b border-black/10 text-left text-[11px] uppercase tracking-wide text-black/45"><tr><th className="py-2">Client</th><th>Schedule</th><th>MRR</th><th>Move to</th><th /></tr></thead><tbody>{assignments.map(assignment => {
          const target = moveTargets[assignment.clientId] ?? assignment.financePlanId;
          return <tr key={assignment.clientPaymentPlanId} className="border-b border-black/[0.07]"><td className="py-3 font-medium">{assignment.clientName}</td><td>{assignment.title}</td><td>{(assignment.monthlyAmountCents / 100).toFixed(2)} {assignment.currency.toUpperCase()}</td><td><select aria-label={`Move ${assignment.clientName}`} value={target} onChange={event => setMoveTargets(current => ({ ...current, [assignment.clientId]: event.target.value }))} className="min-h-9 rounded-md border border-black/15 px-2">{activePlans.map(plan => <option key={plan.id} value={plan.id}>{plan.label} · {plan.currency.toUpperCase()}</option>)}</select></td><td className="text-right"><button type="button" disabled={Boolean(busy) || target === assignment.financePlanId} onClick={() => void assign(assignment.clientId, target, dueAt)} className="min-h-9 rounded-md border border-black/15 px-3 text-xs font-semibold disabled:opacity-40">Move</button><button type="button" disabled={Boolean(busy)} onClick={() => void cancel(assignment)} className="ml-2 min-h-9 rounded-md border border-red-200 px-3 text-xs font-semibold text-red-700 disabled:opacity-40">Cancel</button><Link href={`/portal/clients/${assignment.clientId}?tab=finance#client-payment-plans`} className="ml-2 inline-flex min-h-9 items-center rounded-md border border-black/15 px-3 text-xs font-semibold">Open schedule</Link></td></tr>;
        })}</tbody></table></div> : <p className="rounded-md border border-dashed border-black/15 px-4 py-8 text-center text-sm text-black/45">No active client plan assignments.</p>}
      </section>
    </div>
  );
}
