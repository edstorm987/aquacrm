import {
  CheckedMutationError,
  checkedJsonMutation,
  mutationErrorMessage,
  type CheckedJsonMutationOptions,
} from "@/lib/client/checkedMutation";

export type DevTeamMutationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; payload?: unknown };

/**
 * Dev Team controls edit real workspace documents. Keep their UI contract
 * deliberately small: a caller either receives validated success data or one
 * safe message it can render while retaining the current draft/card context.
 */
export async function checkedDevTeamMutation<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  options: CheckedJsonMutationOptions<T>,
): Promise<DevTeamMutationResult<T>> {
  try {
    return {
      ok: true,
      value: await checkedJsonMutation<T>(input, init, options),
    };
  } catch (error) {
    const failure: DevTeamMutationResult<T> = {
      ok: false,
      error: mutationErrorMessage(error, options.fallback),
    };
    if (error instanceof CheckedMutationError && error.payload !== undefined) {
      failure.payload = error.payload;
    }
    return failure;
  }
}
