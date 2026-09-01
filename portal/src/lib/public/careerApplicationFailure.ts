export const CAREER_APPLICATION_FAILURE_CODE = "career_application_unavailable" as const;
export const CAREER_APPLICATION_FAILURE_MESSAGE = "Applications are temporarily unavailable. Please try again later.";

/** Exact anonymous DTO: provider/database detail can never flow through it. */
export function careerApplicationFailurePayload(incidentId: string) {
  return {
    ok: false as const,
    code: CAREER_APPLICATION_FAILURE_CODE,
    error: CAREER_APPLICATION_FAILURE_MESSAGE,
    incidentId,
  };
}
