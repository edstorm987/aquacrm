import "server-only";

/**
 * Serialise the two public request paths for one browser submission inside a
 * running server process. The stable submission id is still persisted on the
 * enquiry, so a later retry can resume after this process has gone away; this
 * queue only closes the same-process race between the tag and the host form.
 */
const submissionTails = new Map<string, Promise<void>>();

export async function withEnquirySubmissionOperation<T>(
  submissionId: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (!submissionId) return operation();

  const previous = submissionTails.get(submissionId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => current);
  submissionTails.set(submissionId, tail);

  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (submissionTails.get(submissionId) === tail) submissionTails.delete(submissionId);
  }
}

