import type {
  LocalRepositoryPreviewSnapshot,
  LocalRepositoryPreviewState,
} from "@/lib/shared/localRepositoryPreview";

const TRANSITION_POLL_DELAY_MS: Partial<Record<LocalRepositoryPreviewState, number>> = {
  starting: 800,
  stopping: 1_500,
};

type PollWait = (milliseconds: number, signal: AbortSignal) => Promise<void>;

function waitForPoll(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolveWait => {
    if (signal.aborted) {
      resolveWait();
      return;
    }
    const finish = () => {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolveWait();
    };
    const timer = window.setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
  });
}

export interface RepositoryPreviewTransitionPollOptions {
  initialState: LocalRepositoryPreviewState;
  signal: AbortSignal;
  /** `null` means a pre-mutation status raced the current action; poll again. */
  requestStatus: () => Promise<LocalRepositoryPreviewSnapshot | null>;
  onSnapshot: (snapshot: LocalRepositoryPreviewSnapshot) => void;
  /** Injectable clock used by the deterministic call-count regression. */
  wait?: PollWait;
}

/**
 * Poll only while a lifecycle mutation is in flight.
 *
 * `healthy`, `stopped` and every failure are settled snapshots. They must not
 * create a permanent stream of status POSTs merely because the control remains
 * mounted. A later user action supplies a new transitional initial state.
 */
export async function pollRepositoryPreviewTransition({
  initialState,
  signal,
  requestStatus,
  onSnapshot,
  wait = waitForPoll,
}: RepositoryPreviewTransitionPollOptions): Promise<void> {
  let state = initialState;
  while (!signal.aborted) {
    const delay = TRANSITION_POLL_DELAY_MS[state];
    if (!delay) return;
    await wait(delay, signal);
    if (signal.aborted) return;
    const snapshot = await requestStatus();
    if (signal.aborted) return;
    if (!snapshot) continue;
    onSnapshot(snapshot);
    state = snapshot.state;
  }
}
