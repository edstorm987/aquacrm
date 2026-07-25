// Admin-side discount-code editor types.
//
// Lifted from the discount-code slice of
// `02 felicias aqua portal work/src/lib/admin/marketing.ts`. The 02 module
// also carried UTM-attribution + funnel helpers — those belong in a
// future marketing plugin (see chapter §"Cross-team handoff").

import type { CustomDiscountCode } from "../../server/discounts";

export interface DiscountListFilter {
  q?: string;
  onlyActive?: boolean;
}

export function filterDiscounts(codes: CustomDiscountCode[], filter: DiscountListFilter): CustomDiscountCode[] {
  let out = codes;
  if (filter.onlyActive) out = out.filter(c => c.active);
  if (filter.q) {
    const q = filter.q.toLowerCase();
    out = out.filter(c =>
      c.code.toLowerCase().includes(q) ||
      (c.description ?? "").toLowerCase().includes(q),
    );
  }
  return out;
}

export function describeDiscount(c: CustomDiscountCode): string {
  switch (c.type) {
    case "percent": return `${c.value}% off`;
    case "fixed": return `£${(c.value / 100).toFixed(2)} off`;
    case "freeship": return "Free shipping";
    default: return "Discount";
  }
}
