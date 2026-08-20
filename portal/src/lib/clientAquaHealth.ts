import type { ClientContract } from "@/lib/clientContracts";
import { summarizeClientTelemetry, type ClientTelemetryEvent } from "@/lib/clientTelemetry";
import { formatUkDate } from "@/lib/formatDateTime";

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
  id: "payment" | "relationship" | "enquiry" | "traffic" | "support" | "agreement";
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
  /**
   * Raw telemetry from the client's tagged sites (via the Aqua tag). Feeds the
   * enquiry-flow and site-traffic factors. Absent (no tag / no site) keeps both
   * factors honestly `learning` rather than punishing a client with no site.
   */
  telemetryEvents?: ClientTelemetryEvent[];
}

const DAY = 24 * 60 * 60 * 1_000;
const MONTH = 30 * DAY;

// Evolving-baseline tuning (confirmed with Ed 2026-08-19): compare this 30-day
// window to a rolling baseline of prior months, tolerate a ±10% band, and flag
// when it falls below. Growth ratchets the baseline up, so "not growing" reads
// as a dip and each new high sets the new standard. Floors gate the *risk* tier
// so a client with a handful of enquiries never trips an alarm.
const BASELINE_TOLERANCE = 0.1;
const ENQUIRY_BASELINE_FLOOR = 3;
const TRAFFIC_BASELINE_FLOOR = 20;
const MAX_BASELINE_MONTHS = 6;

export function calculateClientAquaHealth(input: ClientAquaHealthInput): ClientAquaHealth {
  const now = input.now ?? Date.now();
  const factors = [
    paymentFactor(input.financeConnected, input.invoices, now),
    relationshipFactor(input.lastContactedAt, now),
    enquiryFactor(input.telemetryEvents, now),
    trafficFactor(input.telemetryEvents, now),
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
  const base = { id: "payment" as const, label: "Payment relationship", weight: 28 };
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
  const base = { id: "relationship" as const, label: "Communication cadence", weight: 22 };
  if (!lastContactedAt) return learning(base, "No client contact has been recorded yet.", ["Log a call, message or meeting to activate this signal."]);
  const days = Math.max(0, Math.floor((now - lastContactedAt) / DAY));
  const score = days <= 7 ? 100 : days <= 14 ? 80 : days <= 30 ? 45 : 10;
  return scored(base, score, days === 0 ? "Client contact was recorded today." : `Last client contact was ${days} day${days === 1 ? "" : "s"} ago.`, [
    formatUkDate(lastContactedAt, { day: "numeric", month: "short", year: "numeric" }),
  ]);
}

export type ClientTelemetryRiskKind = "enquiry-none" | "traffic-silent" | "traffic-drop";

/**
 * A telemetry factor currently in the risk tier — the signals Phase 2 raises as
 * Command Centre alerts. Derived from the same verdicts as the health factors,
 * so an alert can never disagree with the health chip on the client workspace.
 */
export interface ClientTelemetryRiskSignal {
  id: "enquiry" | "traffic";
  kind: ClientTelemetryRiskKind;
  /** Short human phrase for an alert title, e.g. "no enquiries this month". */
  headline: string;
  /** The factor's exact evidence sentence. */
  detail: string;
}

interface TelemetryVerdict {
  /** null => `learning` (uncounted); otherwise the factor's 0–100 score. */
  score: number | null;
  detail: string;
  evidence: string[];
  /** Set only when the verdict is alert-worthy (fires a Command Centre alert). */
  risk: { kind: ClientTelemetryRiskKind; headline: string } | null;
}

/**
 * Enquiry flow from the client's tagged sites — form and conversion telemetry
 * against an evolving monthly baseline. A fall to none against an established
 * baseline is the "no enquiries this month" risk Ed named (alert-worthy); a
 * softer dip stays informational; no baseline yet stays honestly `learning`.
 */
function enquiryVerdict(events: ClientTelemetryEvent[] | undefined, now: number): TelemetryVerdict {
  if (!events?.length) {
    return { score: null, detail: "No website enquiry telemetry is connected for this client yet.", evidence: ["Install the Aqua tag on the client's site to activate this signal."], risk: null };
  }
  const stamps = events.filter(event => event.type === "form" || event.type === "conversion").map(event => event.occurredAt);
  const { current, baseline, ratio, priorMonths } = signalBaseline(stamps, now, ENQUIRY_BASELINE_FLOOR);
  if (ratio === null || baseline === null) {
    return {
      score: null,
      detail: priorMonths < 1 ? "Enquiry flow is still building its first month of baseline evidence." : "Too few enquiries so far to set a reliable baseline.",
      evidence: [`${current} enquir${current === 1 ? "y" : "ies"} in the last 30 days`, baseline === null ? "no baseline yet" : `baseline ${baseline.toFixed(1)}/mo`],
      risk: null,
    };
  }
  const evidence = [`${current} in the last 30 days`, `baseline ${baseline.toFixed(1)}/mo`, `${priorMonths} month${priorMonths === 1 ? "" : "s"} observed`];
  if (current === 0) {
    // Fallen to nothing against an established baseline — the "no enquiries this
    // month" signal. Score in the severe band so it drives the client to risk.
    return { score: 8, detail: `No enquiries in the last 30 days, against a baseline of ${baseline.toFixed(1)} per month.`, evidence, risk: { kind: "enquiry-none", headline: "no enquiries this month" } };
  }
  if (ratio >= 1 - BASELINE_TOLERANCE) {
    return {
      score: ratio >= 1 ? 100 : 85,
      detail: ratio >= 1 ? `Enquiries are at or above the evolving baseline (${current} vs ${baseline.toFixed(1)}/mo).` : `Enquiries are within the 10% tolerance of the baseline (${current} vs ${baseline.toFixed(1)}/mo).`,
      evidence,
      risk: null,
    };
  }
  // A dip below tolerance but not to zero stays informational — only a fall to
  // none raises a Command Centre alert for enquiries. The factor still visibly
  // softens so the trend is legible before it hits zero.
  const score = Math.min(79, Math.max(55, Math.round(55 + (ratio / (1 - BASELINE_TOLERANCE)) * 24)));
  return { score, detail: `Enquiries are ${downPercent(ratio)} on the evolving baseline (${current} vs ${baseline.toFixed(1)}/mo).`, evidence, risk: null };
}

/**
 * Site traffic from the client's tagged sites — pageview telemetry against an
 * evolving monthly baseline. Gone silent or a ≥50% fall is alert-worthy risk; a
 * softer dip is watch; a surge is surfaced as good news. Recent production
 * errors cap the factor so an erroring site never reads as healthy traffic
 * (folds in `clientNeedsAttention`'s telemetry-error check).
 */
function trafficVerdict(events: ClientTelemetryEvent[] | undefined, now: number): TelemetryVerdict {
  if (!events?.length) {
    return { score: null, detail: "No website traffic telemetry is connected for this client yet.", evidence: ["Install the Aqua tag on the client's site to activate this signal."], risk: null };
  }
  const stamps = events.filter(event => event.type === "pageview").map(event => event.occurredAt);
  const { current, baseline, ratio, priorMonths } = signalBaseline(stamps, now, TRAFFIC_BASELINE_FLOOR);
  const errors24h = summarizeClientTelemetry(events, now).errors24h;
  if (ratio === null || baseline === null) {
    return {
      score: null,
      detail: priorMonths < 1 ? "Site traffic is still building its first month of baseline evidence." : "Too little traffic so far to set a reliable baseline.",
      evidence: [`${current} view${current === 1 ? "" : "s"} in the last 30 days`, baseline === null ? "no baseline yet" : `baseline ${baseline.toFixed(0)}/mo`],
      risk: null,
    };
  }
  const evidence = [`${current} views in the last 30 days`, `baseline ${baseline.toFixed(0)}/mo`, ...(errors24h ? [`${errors24h} production error${errors24h === 1 ? "" : "s"} in 24h`] : [])];
  let score: number;
  let detail: string;
  let risk: TelemetryVerdict["risk"] = null;
  if (current === 0) {
    score = 6;
    detail = `Traffic has gone silent — 0 views in 30 days against a baseline of ${baseline.toFixed(0)} per month.`;
    risk = { kind: "traffic-silent", headline: "site traffic has gone silent" };
  } else if (ratio < 0.5) {
    // A ≥50% fall against the baseline is alert-worthy: (0,0.5) → score (6,20).
    score = Math.round(6 + (ratio / 0.5) * 14);
    detail = `Traffic is ${downPercent(ratio)} on the evolving baseline (${current} vs ${baseline.toFixed(0)}/mo).`;
    risk = { kind: "traffic-drop", headline: `traffic ${downPercent(ratio)}` };
  } else if (ratio < 1 - BASELINE_TOLERANCE) {
    // A 10–50% dip is watch (informational): [0.5,0.9) → score [55,79).
    score = Math.round(55 + ((ratio - 0.5) / (0.5 - BASELINE_TOLERANCE)) * 24);
    detail = `Traffic is ${downPercent(ratio)} on the evolving baseline (${current} vs ${baseline.toFixed(0)}/mo).`;
  } else if (ratio >= 1.5) {
    score = 100;
    detail = `Traffic has surged ${Math.round((ratio - 1) * 100)}% above the evolving baseline (${current} vs ${baseline.toFixed(0)}/mo).`;
  } else {
    score = ratio >= 1 ? 100 : 85;
    detail = `Traffic is holding around the evolving baseline (${current} vs ${baseline.toFixed(0)}/mo).`;
  }
  if (errors24h > 0) {
    score = Math.min(score, 70);
    detail = `${detail} ${errors24h} production error${errors24h === 1 ? "" : "s"} in the last 24 hours.`;
  }
  return { score, detail, evidence, risk };
}

function enquiryFactor(events: ClientTelemetryEvent[] | undefined, now: number): AquaHealthFactor {
  const base = { id: "enquiry" as const, label: "Enquiry flow", weight: 18 };
  const verdict = enquiryVerdict(events, now);
  return verdict.score === null ? learning(base, verdict.detail, verdict.evidence) : scored(base, verdict.score, verdict.detail, verdict.evidence);
}

function trafficFactor(events: ClientTelemetryEvent[] | undefined, now: number): AquaHealthFactor {
  const base = { id: "traffic" as const, label: "Site traffic", weight: 12 };
  const verdict = trafficVerdict(events, now);
  return verdict.score === null ? learning(base, verdict.detail, verdict.evidence) : scored(base, verdict.score, verdict.detail, verdict.evidence);
}

/**
 * The enquiry/traffic signals currently in the risk tier — the ones Phase 2
 * surfaces as specific Command Centre alerts. Empty when nothing is firing or
 * there is no established baseline yet. Reuses the exact factor verdicts.
 */
export function clientTelemetryRiskSignals(events: ClientTelemetryEvent[] | undefined, now = Date.now()): ClientTelemetryRiskSignal[] {
  const signals: ClientTelemetryRiskSignal[] = [];
  const enquiry = enquiryVerdict(events, now);
  if (enquiry.risk) signals.push({ id: "enquiry", ...enquiry.risk, detail: enquiry.detail });
  const traffic = trafficVerdict(events, now);
  if (traffic.risk) signals.push({ id: "traffic", ...traffic.risk, detail: traffic.detail });
  return signals;
}

function supportFactor(observed: boolean, requests: AquaHealthRequestEvidence[], now: number): AquaHealthFactor {
  const base = { id: "support" as const, label: "Support pressure", weight: 12 };
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
  const base = { id: "agreement" as const, label: "Commercial commitment", weight: 8 };
  if (!contracts.length) return learning(base, "No agreement has been recorded for this client.", ["Create or send a contract to activate this signal."]);
  const accepted = contracts.filter(contract => contract.status === "accepted");
  const sent = contracts.filter(contract => contract.status === "sent");
  const declined = contracts.filter(contract => contract.status === "declined");
  if (declined.length) return scored(base, 0, `${declined.length} agreement${declined.length === 1 ? " has" : "s have"} been declined.`, [`${accepted.length} accepted`, `${sent.length} awaiting decision`]);
  if (accepted.length) return scored(base, sent.length ? 85 : 100, `${accepted.length} agreement${accepted.length === 1 ? " is" : "s are"} accepted.`, [`${sent.length} awaiting decision`, `${contracts.length} total version${contracts.length === 1 ? "" : "s"}`]);
  if (sent.length) return scored(base, 60, `${sent.length} agreement${sent.length === 1 ? " is" : "s are"} awaiting a decision.`, [`${contracts.length - sent.length} draft`]);
  return scored(base, 40, "Agreements exist but none have been sent or accepted.", [`${contracts.length} draft agreement${contracts.length === 1 ? "" : "s"}`]);
}

interface SignalBaseline {
  current: number;
  baseline: number | null;
  ratio: number | null;
  priorMonths: number;
}

/**
 * Bucket a signal's timestamps into 30-day windows and measure this window
 * against a rolling baseline of the prior windows across the signal's own
 * observed span (quiet months count as zero, so a fading signal pulls its own
 * bar down and a growing one ratchets it up). `baseline`/`ratio` stay null —
 * i.e. the caller shows honest `learning` — until there is a full prior month
 * AND an established baseline at or above `floor`, so a thin trickle of
 * evidence never manufactures a risk.
 */
function signalBaseline(timestamps: number[], now: number, floor: number): SignalBaseline {
  const counts: number[] = [];
  let maxBucket = 0;
  for (const at of timestamps) {
    const age = now - at;
    if (age < 0 || age >= (MAX_BASELINE_MONTHS + 1) * MONTH) continue;
    const bucket = Math.floor(age / MONTH);
    counts[bucket] = (counts[bucket] ?? 0) + 1;
    if (bucket > maxBucket) maxBucket = bucket;
  }
  const current = counts[0] ?? 0;
  if (maxBucket < 1) return { current, baseline: null, ratio: null, priorMonths: 0 };
  let sum = 0;
  for (let bucket = 1; bucket <= maxBucket; bucket += 1) sum += counts[bucket] ?? 0;
  const priorMonths = maxBucket;
  const baseline = sum / priorMonths;
  if (baseline < floor) return { current, baseline, ratio: null, priorMonths };
  return { current, baseline, ratio: current / baseline, priorMonths };
}

function downPercent(ratio: number): string {
  return `down ${Math.round((1 - ratio) * 100)}%`;
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
  if (state === "strong") return "Payment, communication, enquiry, traffic, support and commitment signals are currently strong.";
  return "The relationship is stable, with one or more signals worth watching.";
}

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`;
  }
}
