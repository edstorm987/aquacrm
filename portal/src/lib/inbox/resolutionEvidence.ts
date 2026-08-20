/**
 * The actual records that tripped a check, pulled in rather than linked to.
 *
 * "Evidence" that navigates you to a list and leaves you to find the row is
 * barely better than no button: on a long list the thing you were sent to see
 * has scrolled off, and you end up reconstructing why the alert fired at all.
 *
 * So the records come to the alert. Enough of each one to decide without
 * leaving, and a link for when you do want the full thing.
 */

export interface EvidenceField {
  label: string;
  value: string;
  /** Draws the eye to the figure that actually breached. */
  emphasis?: boolean;
}

/**
 * A metric's history, so a deviation can be seen rather than described.
 *
 * "99 robust deviations from its retained median" is unreadable; the same
 * information as a line against its median is obvious at a glance — including
 * when the movement is trivial and the alert is noise.
 */
export interface EvidenceSeriesPoint {
  at: number;
  value: number;
  status: "pass" | "critical" | "warning" | "watch" | "blind";
}

export interface EvidenceSeries {
  label: string;
  points: EvidenceSeriesPoint[];
  /** The baseline the check measures against, drawn as a reference line. */
  median?: number;
  /** What "good" looks like, when the check knows. */
  expectedDirection?: "higher" | "lower" | "neutral";
  unit?: string;
}

export interface EvidenceRecord {
  id: string;
  label: string;
  /** Secondary line — a date, a status, whoever owns it. */
  meta?: string;
  fields: EvidenceField[];
  /** The full record, for when the summary is not enough. */
  href?: string;
  /** Plotted when the record is a measurement with history. */
  series?: EvidenceSeries;
}

/**
 * A concrete thing to do, in order.
 *
 * "Clears when the invoice is paid" states a condition; it does not tell you
 * to ring the client on the number sitting three fields above. Steps are the
 * difference between an operator knowing the alert is real and knowing what
 * to do about it.
 */
export interface EvidenceStep {
  /** Imperative and specific — "Ring Sarah on 0161 496 0000", not "chase". */
  label: string;
  /** Where to do it, when it happens in Aqua. */
  href?: string;
  /** Already satisfied, shown struck through rather than hidden. */
  done?: boolean;
}

export interface ResolutionEvidence {
  alertId: string;
  /** One line on what the records below add up to. */
  summary: string;
  records: EvidenceRecord[];
  /** What to actually do, in order. */
  steps?: EvidenceStep[];
  /**
   * Set when the underlying records could not be read — a deleted row, a
   * source that needs credentials. Said out loud rather than rendering an
   * empty panel that looks like "nothing is wrong".
   */
  unavailable?: string;
}
