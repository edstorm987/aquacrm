const AQUA_SUBMISSION_ID = /^aqua_sub_[a-z0-9_-]{12,100}$/i;

export function normaliseAquaSubmissionId(value: unknown): string {
  if (typeof value !== "string") return "";
  const candidate = value.trim().slice(0, 120);
  return AQUA_SUBMISSION_ID.test(candidate) ? candidate : "";
}

export function enquirySubmissionId(metadata: Record<string, unknown> | null | undefined): string {
  return normaliseAquaSubmissionId(metadata?.submissionId);
}

export function enquiryIngestionComplete(metadata: Record<string, unknown> | null | undefined): boolean {
  return metadata?.ingestionState === "complete" && typeof metadata.ingestionCompletedAt === "string";
}

