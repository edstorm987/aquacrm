// The tax position, stated in the direction it actually points.
//
// Reports used to render `Math.max(0, outputTax - inputTax)` in both the metric
// and the "Recorded tax balance" row. When recoverable tax exceeds tax charged
// — money owed BACK — the clamp turned a reclaim into "£0.00" and the operator
// had no way to know one existed. A number that can only be positive is not a
// balance; it is half of one.
//
// Pure so it can be tested without rendering the page.

export type TaxDirection = "owed" | "reclaim" | "level";

export interface TaxPosition {
  /** Signed: positive = owed to the tax authority, negative = reclaimable. */
  netCents: number;
  /** Always positive — what the screen prints beside the label. */
  displayCents: number;
  direction: TaxDirection;
  /** Metric label. */
  label: string;
  /** The longer row label used in the tax-evidence table. */
  recordedLabel: string;
}

export function taxPosition(outputTaxCents: number, inputTaxCents: number): TaxPosition {
  const netCents = outputTaxCents - inputTaxCents;
  const direction: TaxDirection = netCents < 0 ? "reclaim" : netCents > 0 ? "owed" : "level";
  return {
    netCents,
    displayCents: Math.abs(netCents),
    direction,
    label: direction === "reclaim" ? "Tax to reclaim" : "Tax balance",
    recordedLabel: direction === "reclaim" ? "Recorded tax to reclaim" : "Recorded tax balance",
  };
}
