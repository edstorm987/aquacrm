"use client";

// Client-side wrapper around the foundation-injected GitOpsPort.
// Round-6. Calls go through `/api/portal/website-editor/git/*` HTTP
// proxies (when foundation wires them) which delegate to the actual
// GitOpsPort implementation injected into this plugin's container.
//
// When no GitOpsPort impl is available, every call here returns a
// `{ ok: false, available: false }` shape and the GitStatusPage
// renders an empty / "not wired yet" state — exactly the graceful-
// degradation contract the prompt asks for.

import type {
  GitStatus,
  GitCommitResult,
  GitPushResult,
} from "../server/extensionPorts";

const BASE = "/api/portal/website-editor/git";

export interface ClientStatus {
  available: boolean;       // false when GitOpsPort isn't wired
  clientId: string;
  status?: GitStatus;
  error?: string;
}

export async function fetchClientStatus(clientId: string): Promise<ClientStatus> {
  if (typeof window === "undefined") return { available: false, clientId };
  try {
    const url = new URL(`${BASE}/status`, window.location.origin);
    url.searchParams.set("clientId", clientId);
    const res = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
    if (res.status === 404) return { available: false, clientId };
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { available: true, clientId, error: data?.error ?? `status ${res.status}` };
    }
    const data = await res.json() as { status: GitStatus };
    return { available: true, clientId, status: data.status };
  } catch (e) {
    return { available: false, clientId, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function stageFiles(clientId: string, files: string[]): Promise<{ ok: boolean; error?: string }> {
  return postJson(`${BASE}/stage`, { clientId, files });
}

export async function unstageFiles(clientId: string, files: string[]): Promise<{ ok: boolean; error?: string }> {
  return postJson(`${BASE}/unstage`, { clientId, files });
}

export async function commitFiles(
  clientId: string,
  message: string,
  author?: string,
): Promise<GitCommitResult & { available: boolean }> {
  return withAvailability(postJson(`${BASE}/commit`, { clientId, message, author }));
}

export async function pushBranch(clientId: string, branch?: string): Promise<GitPushResult & { available: boolean }> {
  return withAvailability(postJson(`${BASE}/push`, { clientId, branch }));
}

export async function openPullRequest(
  clientId: string,
  title: string,
  body?: string,
): Promise<{ ok: boolean; url?: string; error?: string; available: boolean }> {
  return withAvailability(postJson(`${BASE}/pr`, { clientId, title, body }));
}

async function postJson(path: string, body: unknown): Promise<{ ok: boolean; error?: string } & Record<string, unknown>> {
  if (typeof window === "undefined") return { ok: false, error: "SSR" };
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (res.status === 404) return { ok: false, error: "GitOpsPort not wired" };
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error ?? `status ${res.status}` };
    return { ok: true, ...data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function withAvailability<T extends { ok: boolean; error?: string }>(p: Promise<T>): Promise<T & { available: boolean }> {
  const r = await p;
  return { ...r, available: r.error !== "GitOpsPort not wired" };
}
