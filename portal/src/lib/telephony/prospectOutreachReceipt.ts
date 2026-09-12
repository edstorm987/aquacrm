export interface ProspectOutreachReceipt {
  /** True only when the provider action was also persisted in the Prospect ledger. */
  outreachRecorded: boolean;
  /** Stable identity used to finalise or repair this one provider action. */
  outreachAttemptId?: string;
}

export function readProspectOutreachReceipt(value: unknown): ProspectOutreachReceipt {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const outreachAttemptId = typeof row.outreachAttemptId === "string" && row.outreachAttemptId.trim()
    ? row.outreachAttemptId.trim()
    : undefined;
  return {
    // A recorded receipt without the row identity cannot be safely finalised
    // by the caller, so treat that malformed response as unconfirmed.
    outreachRecorded: row.outreachRecorded === true && Boolean(outreachAttemptId),
    ...(outreachAttemptId ? { outreachAttemptId } : {}),
  };
}
