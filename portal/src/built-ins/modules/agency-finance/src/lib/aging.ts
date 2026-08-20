// AR / AP aging — who owes you (receivables) and what you owe (payables),
// bucketed by how overdue it is. Pure computation over records the finance
// services already hold; record + surface only.

export type AgingBucketKey = "current" | "1-30" | "31-60" | "61-90" | "90+";

export interface AgingBucket {
  key: AgingBucketKey;
  label: string;
  count: number;
  totalCents: number;
}

export interface AgingSummary {
  buckets: AgingBucket[];  // always all five, in order
  totalCents: number;      // everything outstanding
  count: number;
  overdueCents: number;    // the part that is actually past due (not "current")
}

// A single thing that is owed, and the date it is/was due.
export interface AgingItem {
  amountCents: number;
  dueAt: number;
}

const DAY = 86_400_000;

const BUCKETS: Array<{ key: AgingBucketKey; label: string; min: number; max: number }> = [
  { key: "current", label: "Current / not due", min: -Infinity, max: 0 },
  { key: "1-30", label: "1–30 days overdue", min: 1, max: 30 },
  { key: "31-60", label: "31–60 days overdue", min: 31, max: 60 },
  { key: "61-90", label: "61–90 days overdue", min: 61, max: 90 },
  { key: "90+", label: "90+ days overdue", min: 91, max: Infinity },
];

// Bucket outstanding items by days past due. Amounts are summed as-is, so pass
// a single currency's items (the caller filters) to keep the totals honest.
export function summariseAging(items: readonly AgingItem[], now: number): AgingSummary {
  const buckets: AgingBucket[] = BUCKETS.map(bucket => ({ key: bucket.key, label: bucket.label, count: 0, totalCents: 0 }));
  let totalCents = 0;
  let count = 0;
  let overdueCents = 0;
  for (const item of items) {
    const daysPast = Math.floor((now - item.dueAt) / DAY);
    const index = BUCKETS.findIndex(bucket => daysPast >= bucket.min && daysPast <= bucket.max);
    const bucket = buckets[index >= 0 ? index : 0];
    bucket.count += 1;
    bucket.totalCents += item.amountCents;
    totalCents += item.amountCents;
    count += 1;
    if (daysPast > 0) overdueCents += item.amountCents;
  }
  return { buckets, totalCents, count, overdueCents };
}
