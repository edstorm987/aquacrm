import type { DevConsoleCore, DevConsoleStatus } from "@/lib/server/dev/devConsoleStatus";

// What the Dev Console popover does with the two reads it fires.
//
// Lifted out of `DevConsolePanel` because it is the part with rules, and the
// rules were wrong in ways nobody could see from the screen:
//
//   • the post-save reload discarded the fresh `?part=core` response (the guard
//     was `previous ?? value`, which only ever makes sense on a FIRST load), so
//     the topbar badge moved while the panel's own Findings tile and list kept
//     showing pre-save data — and stayed wrong for good if the slow read failed;
//   • "Working now" printed the length of a list that is deliberately capped at
//     five, so the popover and the Command Centre station quoted different
//     worker counts at each other;
//   • two of the route's three failures are machine codes, and the founder read
//     the word "not_found" with no hint that Dev Mode is simply off.
//
// A component that owns its own state cannot be driven by a test. This can.

/**
 * The full read, plus the uncapped worker total the route counts alongside the
 * (deliberately sliced) `workers` list.
 *
 * Optional because a server mid-deploy may still answer without it — the
 * fallback is the list length, which is what the panel used to show everywhere.
 */
export type ConsoleStatus = DevConsoleStatus & { activeWorkers?: number };

/**
 * How many workers to SAY there are.
 *
 * Never below the number of rows on screen: the list is evidence, and a
 * "N more" affordance derived from this must not go negative if the count and
 * the list were read either side of a new check-in.
 */
export function workerTotal(status: ConsoleStatus): number {
  return Math.max(status.activeWorkers ?? status.workers.length, status.workers.length);
}

/**
 * The console route answers two of its three failures with machine codes
 * ("unauthorized", "not_found") and only the 500 path with a sentence. The
 * founder is the only reader this panel ever has.
 */
export function readableError(code: string | undefined, httpStatus: number): string {
  if (httpStatus === 404 || code === "not_found") return "Dev Mode is off — reload the page to hide the console.";
  if (httpStatus === 401 || code === "unauthorized") return "Your session ended. Sign in again.";
  return code || `Status unavailable (${httpStatus}).`;
}

/** Everywhere a load writes to. Named so a test can watch each one. */
export interface ConsoleLoadSinks {
  setCore: (value: DevConsoleCore) => void;
  setStatus: (value: ConsoleStatus) => void;
  /** Both halves failed — the red bar. */
  setError: (message: string) => void;
  /** Only the slow half failed — the worker section, which must not spin forever. */
  setStatusError: (message: string) => void;
  setAttention: (attention: number) => void;
  /** "updated 2m ago" — bumped whenever a half lands. */
  markUpdated: () => void;
}

/**
 * Fire both reads, paint whichever lands, and report honestly if one does not.
 *
 * The guard is ORDERING, not richness. `load()` runs again after every save, so
 * "keep the answer we already have" is exactly wrong: both halves carry the
 * same core fields (`readStatus` spreads `devConsoleCore`), so a later response
 * is never poorer — the only thing worth ignoring is a response belonging to a
 * load that has since been superseded. `token` is bumped per load and shared
 * across calls (a ref in the component), so an in-flight response from load N
 * cannot repaint what load N+1 already painted.
 */
export async function runDevConsoleLoad(input: {
  read: (part: "core" | "full") => Promise<ConsoleStatus>;
  sinks: ConsoleLoadSinks;
  token: { current: number };
}): Promise<void> {
  const { read, sinks, token } = input;
  sinks.setError("");
  sinks.setStatusError("");

  const id = token.current + 1;
  token.current = id;
  const stale = () => token.current !== id;

  const paint = (value: ConsoleStatus, full: boolean) => {
    if (stale()) return;
    if (full) sinks.setStatus(value);
    sinks.setCore(value);
    sinks.markUpdated();
    sinks.setAttention(value.attention);
  };

  const fast = read("core").then(value => paint(value, false));
  const full = read("full").then(value => paint(value, true));

  // Only a total failure is worth the red bar — if either half arrived, the
  // console is useful. A half that failed still has to SAY so, or the worker
  // section sits on a spinner pretending it is still reading.
  const results = await Promise.allSettled([fast, full]);
  if (stale()) return;
  const message = (result: PromiseSettledResult<void>) =>
    result.status === "rejected" && result.reason instanceof Error ? result.reason.message : "";
  if (results.every(result => result.status === "rejected")) {
    sinks.setError(message(results[0]) || "Could not read the Dev Console status.");
  } else if (results[1].status === "rejected") {
    sinks.setStatusError(message(results[1]) || "Could not read worker activity.");
  }
}
