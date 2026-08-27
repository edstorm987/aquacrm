const SANDBOX_MODE_REQUEST_TIMEOUT_MS = 15_000;

export interface SandboxModeResponse {
  ok?: boolean;
  redirect?: string;
  error?: string;
}

/**
 * Environment switches may be interrupted while the local Next.js server is
 * rebuilding. Always give the UI its controls back instead of leaving the
 * operator trapped behind a permanent Preparing/ellipsis state.
 */
export async function requestSandboxMode(body: Record<string, unknown>): Promise<SandboxModeResponse> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), SANDBOX_MODE_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch("/api/auth/sandbox-mode", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({})) as SandboxModeResponse;
    if (!response.ok || !result.ok) {
      throw new Error(result.error || "Sandbox Mode could not be changed.");
    }
    return result;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Sandbox Mode took too long. The local server may still be compiling; try again in a moment.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
