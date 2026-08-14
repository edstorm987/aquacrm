import type { ClientContract } from "@/lib/clientContracts";

export type AquaHealthState = "strong" | "watch" | "risk" | "learning";

export interface AquaHealthInvoiceEvidence {
  status: "draft" | "sent" | "paid" | "overdue" | "void" | "refunded";
  dueAt: number;
  paidAt?: number;
  totalCents: number;
  currency: string;
}

export interface AquaHealthRequestEvidence {
  type?: string;
  status?: string;
  priority?: string;
  submittedAt?: number;
  replies?: Array<{ from?: string; createdAt?: number }>;
}

export interface AquaHealthFactor {
  id: "payment" | "relationship" | "support" | "agreement";
  label: string;
  weight: number;
  score: number | null;
  state: AquaHealthState;
  detail: string;
  evidence: string[];
}

export interface ClientAquaHealth {
  score: number | null;
  confidence: number;
  state: AquaHealthState;
  summary: string;
  factors: AquaHealthFactor[];
}

export interface ClientAquaHealthInput {
  now?: number;
  financeConnected: boolean;
  invoices: AquaHealthInvoiceEvidence[];
  lastContactedAt?: number;
  requestsObserved: boolean;
  requests: AquaHealthRequestEvidence[];
  contracts: ClientContract[];
}

const DAY = 24 * 60 * 60 * 1_000;

export function calculateClientAquaHealth(input: ClientAquaHealthInput): ClientAquaHealth {
  const now = input.now ?? Date.now();
  const factors = [
    paymentFactor(input.financeConnected, input.invoices, now),
    relationshipFactor(input.lastContactedAt, now),
    supportFactor(input.requestsObserved, input.requests, now),
    agreementFactor(input.contracts),
  ];
  const observed = factors.filter(factor => factor.score !== null);
  const observedWeight = observed.reduce((total, factor) => total + factor.weight, 0);
  const confidence = Math.round(observedWeight);
  const score = observedWeight
    ? Math.round(observed.reduce((total, factor) => total + factor.score! * factor.weight, 0) / observedWeight)
    : null;
  const severeKnownRisk = factors.some(factor => factor.state === "risk" && factor.score !== null && factor.score <= 20);
  const state: AquaHealthState = severeKnownRisk
    ? "risk"
    : confidence < 50
      ? "learning"
      : score !== null && score >= 80
        ? "strong"
        : score !== null && score >= 55
          ? "watch"
          : "risk";

  return {
    score,
    confidence,
    state,
    summary: summaryFor(state, factors),
    factors,
  };
}

function paymentFactor(connected: boolean, invoices: AquaHealthInvoiceEvidence[], now: number): AquaHealthFactor {
  const base = { id: "payment" as const, label: "Payment relationship", weight: 35 };
  if (!connected) return learning(base, "Finance is not connected, so payment behaviour cannot be assessed.", ["Connect Agency Finance to activate this signal."]);
  const relevant = invoices.filter(invoice => !["void", "refunded"].includes(invoice.status));
  const paid = relevant.filter(invoice => invoice.status === "paid");
  const unpaidPastDue = relevant.filter(invoice => ["sent", "overdue"].includes(invoice.status) && invoice.dueAt < now);
  const open = relevant.filter(invoice => invoice.status === "sent" && invoice.dueAt >= now);
  if (!relevant.length || relevant.every(invoice => invoice.status === "draft")) {
    return learning(base, "No issued or paid invoice history exists yet.", [`${relevant.length} draft invoice${relevant.length === 1 ? "" : "s"}`]);
  }
  const currency = relevant[0]?.currency ?? "gbp";
  const overdueTotal = unpaidPastDue.reduce((total, invoice) => total + invoice.totalCents, 0);
  const onTime = paid.filter(invoice => Boolean(invoice.paidAt && invoice.paidAt! <= invoice.dueAt)).length;
  if (unpaidPastDue.length) {
    return scored(base, 10, `${unpaidPastDue.length} payment${unpaidPastDue.length === 1 ? " is" : "s are"} past due.`, [
      `${money(overdueTotal, currency)} overdue`,
      `${paid.length} paid invoice${paid.length === 1 ? "" : "s"}`,
    ]);
  }
  if (paid.length) {
    const onTimeRate = onTime / paid.length;
    const score = Math.round(60 + onTimeRate * 40 - (open.length ? 5 : 0));
    return scored(base, score, `${onTime} of ${paid.length} paid invoice${paid.length === 1 ? " was" : "s were"} paid by the due date.`, [
      `${Math.round(onTimeRate * 100)}% on-time payment rate`,
      `${open.length} current payment request${open.length === 1 ? "" : "s"}`,
    ]);
  }
  return scored(base, 60, `${open.length} current payment request${open.length === 1 ? " is" : "s are"} awaiting payment.`, ["No payment is overdue", "No paid history yet"]);
}

function relationshipFactor(lastContactedAt: number | undefined, now: number): AquaHealthFactor {
  const base = { id: "relationship" as const, label: "Communication cadence", weight: 30 };
  if (!lastContactedAt) return learning(base, "No client contact has been recorded yet.", ["Log a call, message or meeting to activate this signal."]);
  const days = Math.max(0, Math.floor((now - lastContactedAt) / DAY));
  const score = days <= 7 ? 100 : days <= 14 ? 80 : days <= 30 ? 45 : 10;
  return scored(base, score, days === 0 ? "Client contact was recorded today." : `Last client contact was ${days} day${days === 1 ? "" : "s"} ago.`, [
    new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(lastContactedAt),
  ]);
}

function supportFactor(observed: boolean, requests: AquaHealthRequestEvidence[], now: number): AquaHealthFactor {
  const base = { id: "support" as const, label: "Support pressure", weight: 20 };
  if (!observed) return learning(base, "No support history has been observed for this client.", ["The signal activates when the portal records support activity."]);
  const open = requests.filter(request => request.status === "open");
  const exits = open.filter(request => request.type === "cancel" || request.type === "move-provider");
  const recent = requests.filter(request => typeof request.submittedAt === "number" && now - request.submittedAt < 30 * DAY);
  const urgent = open.filter(request => request.priority === "urgent" || request.priority === "high");
  const score = exits.length ? 0 : urgent.length ? 20 : open.length >= 3 ? 35 : open.length ? 60 : recent.length >= 5 ? 70 : 100;
  const detail = exits.length
    ? `${exits.length} cancellation or provider-move request${exits.length === 1 ? " is" : "s are"} open.`
    : open.length
      ? `${open.length} support request${open.length === 1 ? " is" : "s are"} open.`
      : "No support request is currently open.";
  return scored(base, score, detail, [`${recent.length} request${recent.length === 1 ? "" : "s"} in 30 days`, `${urgent.length} high-priority open`]);
}

function agreementFactor(contracts: ClientContract[]): AquaHealthFactor {
  const base = { id: "agreement" as const, label: "Commercial commitment", weight: 15 };
  if (!contracts.length) return learning(base, "No agreement has been recorded for this client.", ["Create or send a contract to activate this signal."]);
  const accepted = contracts.filter(contract => contract.status === "accepted");
  const sent = contracts.filter(contract => contract.status === "sent");
  const declined = contracts.filter(contract => contract.status === "declined");
  if (declined.length) return scored(base, 0, `${declined.length} agreement${declined.length === 1 ? " has" : "s have"} been declined.`, [`${accepted.length} accepted`, `${sent.length} awaiting decision`]);
  if (accepted.length) return scored(base, sent.length ? 85 : 100, `${accepted.length} agreement${accepted.length === 1 ? " is" : "s are"} accepted.`, [`${sent.length} awaiting decision`, `${contracts.length} total version${contracts.length === 1 ? "" : "s"}`]);
  if (sent.length) return scored(base, 60, `${sent.length} agreement${sent.length === 1 ? " is" : "s are"} awaiting a decision.`, [`${contracts.length - sent.length} draft`]);
  return scored(base, 40, "Agreements exist but none have been sent or accepted.", [`${contracts.length} draft agreement${contracts.length === 1 ? "" : "s"}`]);
}

function learning(base: Pick<AquaHealthFactor, "id" | "label" | "weight">, detail: string, evidence: string[]): AquaHealthFactor {
  return { ...base, score: null, state: "learning", detail, evidence };
}

function scored(base: Pick<AquaHealthFactor, "id" | "label" | "weight">, score: number, detail: string, evidence: string[]): AquaHealthFactor {
  return { ...base, score, state: score >= 80 ? "strong" : score >= 55 ? "watch" : "risk", detail, evidence };
}

function summaryFor(state: AquaHealthState, factors: AquaHealthFactor[]): string {
  const riskiest = factors.filter(factor => factor.state === "risk").sort((left, right) => (left.score ?? 101) - (right.score ?? 101))[0];
  if (riskiest) return `${riskiest.label} needs attention: ${riskiest.detail}`;
  if (state === "learning") return "Aqua Health is still learning because key relationship evidence is not connected yet.";
  if (state === "strong") return "Payment, communication, support and commitment signals are currently strong.";
  return "The relationship is stable, with one or more signals worth watching.";
}

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`;
  }
}
