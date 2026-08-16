import type { OperationalAlert } from "@/lib/operationalAttention";

export interface AttentionThreadCandidate {
  key: string;
  name: string;
  aliases?: string[];
  email?: string;
  clientId?: string;
  formId?: string;
  requestId?: string;
}

export function resolveAttentionThreadKey(alert: OperationalAlert, candidates: AttentionThreadCandidate[]): string | null {
  const target = safeUrl(alert.href);
  const formId = target?.searchParams.get("form");
  if (formId) {
    const match = candidates.find(candidate => candidate.formId === formId);
    if (match) return match.key;
  }

  const requestId = target?.searchParams.get("thread");
  if (requestId) {
    const match = candidates.find(candidate => candidate.requestId === requestId);
    if (match) return match.key;
  }

  const clientId = target?.pathname.match(/^\/portal\/clients\/([^/]+)/)?.[1];
  if (clientId) {
    const decoded = decodeURIComponent(clientId);
    const conversation = candidates.find(candidate => candidate.clientId === decoded && candidate.requestId);
    if (conversation) return conversation.key;
    const profile = candidates.find(candidate => candidate.clientId === decoded);
    if (profile) return profile.key;
  }

  const clientName = normalise(alert.clientName ?? "");
  if (clientName) {
    const conversation = candidates.find(candidate => candidateNames(candidate).includes(clientName) && candidate.requestId);
    if (conversation) return conversation.key;
    const identity = candidates.find(candidate => candidateNames(candidate).includes(clientName));
    if (identity) return identity.key;
  }

  const alertText = normalise(`${alert.title} ${alert.detail}`);
  const named = candidates
    .flatMap(candidate => candidateNames(candidate).map(name => ({ candidate, name })))
    .filter(item => item.name.length >= 3 && alertText.includes(item.name))
    .sort((left, right) => right.name.length - left.name.length)[0];
  if (named) return named.candidate.key;

  const emailed = candidates.find(candidate => candidate.email && alertText.includes(normalise(candidate.email)));
  return emailed?.key ?? null;
}

function safeUrl(href: string): URL | null {
  try {
    return new URL(href, "https://aquacrm.local");
  } catch {
    return null;
  }
}

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function candidateNames(candidate: AttentionThreadCandidate): string[] {
  return [...new Set([candidate.name, ...(candidate.aliases ?? [])].map(normalise).filter(Boolean))];
}
