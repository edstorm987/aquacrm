import "server-only";

export type PublicAuthDeliveryOutcome<T> =
  | { status: "complete"; value: T }
  | { status: "failed" }
  | { status: "timeout" };

function responseWindowMs(env: NodeJS.ProcessEnv = process.env): number {
  const configured = Number(env.PUBLIC_AUTH_RESPONSE_WINDOW_MS);
  if (Number.isFinite(configured)) return Math.max(1, Math.min(5_000, Math.floor(configured)));
  return env.NODE_ENV === "production" ? 1_500 : 10;
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Give public mailbox request endpoints one bounded response window. Known,
 * unknown, provider-error and provider-timeout paths all leave at the same
 * floor; a slow live provider is aborted at the boundary rather than becoming
 * a timing oracle. The task always has a rejection handler attached so an
 * ambiguous late completion cannot become an unhandled exception.
 */
export async function runBoundedPublicAuthDelivery<T>(
  run: (signal: AbortSignal) => Promise<T>,
  options: { startedAt?: number; requestSignal?: AbortSignal } = {},
): Promise<PublicAuthDeliveryOutcome<T>> {
  const startedAt = options.startedAt ?? Date.now();
  const windowMs = responseWindowMs();
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.requestSignal?.addEventListener("abort", abort, { once: true });

  let settled: PublicAuthDeliveryOutcome<T> | undefined;
  const task = Promise.resolve()
    .then(() => run(controller.signal))
    .then(value => { settled = { status: "complete", value }; })
    .catch(() => { settled = { status: "failed" }; });

  const remaining = Math.max(0, startedAt + windowMs - Date.now());
  await Promise.race([task, wait(remaining)]);
  const floorRemaining = Math.max(0, startedAt + windowMs - Date.now());
  if (floorRemaining > 0) await wait(floorRemaining);
  if (!settled) {
    controller.abort();
    void task;
    settled = { status: "timeout" };
  }
  options.requestSignal?.removeEventListener("abort", abort);
  return settled;
}

export async function waitForPublicAuthResponseWindow(startedAt: number): Promise<void> {
  const remaining = Math.max(0, startedAt + responseWindowMs() - Date.now());
  if (remaining > 0) await wait(remaining);
}

/** Static-only telemetry: never serialize provider messages or subjects. */
export function logPublicAuthDeliveryFailure(kind: "magic" | "password-reset", status: "failed" | "timeout"): void {
  console.error(`[public-auth] ${kind} delivery ${status}`);
}
