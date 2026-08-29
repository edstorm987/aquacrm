"use client";

// Browser-side calls to the journey API.
//
// One module, so the `?clientId=` that every plugin call needs is added in
// exactly one place. The host dispatcher can also infer it from the referer,
// but relying on that makes the fetch silently depend on a header the browser
// may withhold — sending it explicitly is one parameter and no ambiguity.

import type {
  Automation,
  AutomationRunOutcome,
  CreateAutomationInput,
  JourneyBoard,
  Pipeline,
  StageKind,
  StageTone,
  UpdateAutomationPatch,
} from "./journey";

const BASE = "/api/portal/client-crm";

/** Distinguishes "this client does not have the add-on" from a real failure. */
export class FeatureDisabledError extends Error {
  constructor() {
    super("feature_disabled");
    this.name = "FeatureDisabledError";
  }
}

async function call<T>(
  path: string,
  clientId: string,
  init?: RequestInit & { query?: Record<string, string | undefined> },
): Promise<T> {
  const url = new URL(`${BASE}/${path}`, window.location.origin);
  url.searchParams.set("clientId", clientId);
  for (const [key, value] of Object.entries(init?.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    cache: "no-store",
  });
  const body = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
  if (body?.error === "feature_disabled") throw new FeatureDisabledError();
  if (!response.ok || !body?.ok) {
    // The server's message, not a generic one. Every refusal in this module is
    // written to be read by the client who triggered it ("That contact is
    // already on this pipeline"), and replacing it with "Request failed" is
    // the mask this codebase keeps removing.
    throw new Error(body?.error || `Request failed (${response.status}).`);
  }
  return body as T;
}

export interface BoardResponse { ok: true; board: JourneyBoard | null; automations: Automation[] }

export const fetchBoard = (clientId: string, pipelineId?: string): Promise<BoardResponse> =>
  call<BoardResponse>("pipelines/board", clientId, { query: { pipelineId } });

export const fetchPipelines = (clientId: string): Promise<{ pipelines: Pipeline[] }> =>
  call<{ pipelines: Pipeline[] }>("pipelines", clientId);

export const createPipeline = (clientId: string, name: string, description?: string): Promise<{ pipeline: Pipeline }> =>
  call<{ pipeline: Pipeline }>("pipelines", clientId, { method: "POST", body: JSON.stringify({ name, description }) });

export const renamePipeline = (clientId: string, id: string, name: string): Promise<{ pipeline: Pipeline }> =>
  call<{ pipeline: Pipeline }>("pipelines", clientId, { method: "PATCH", body: JSON.stringify({ id, patch: { name } }) });

export const deletePipeline = (clientId: string, id: string): Promise<unknown> =>
  call("pipelines", clientId, { method: "DELETE", query: { id } });

export const addStage = (
  clientId: string,
  pipelineId: string,
  seed: { name: string; kind?: StageKind; tone?: StageTone; idleAfterDays?: number },
): Promise<{ pipeline: Pipeline }> =>
  call<{ pipeline: Pipeline }>("pipelines/stages", clientId, {
    method: "POST", body: JSON.stringify({ pipelineId, ...seed }),
  });

export const updateStage = (
  clientId: string,
  pipelineId: string,
  stageId: string,
  patch: { name?: string; kind?: StageKind; tone?: StageTone; idleAfterDays?: number | null },
): Promise<{ pipeline: Pipeline }> =>
  call<{ pipeline: Pipeline }>("pipelines/stages", clientId, {
    method: "PATCH", body: JSON.stringify({ pipelineId, stageId, patch }),
  });

export const deleteStage = (clientId: string, pipelineId: string, stageId: string, moveCardsTo?: string): Promise<unknown> =>
  call("pipelines/stages", clientId, { method: "DELETE", query: { pipelineId, stageId, moveCardsTo } });

export const addCard = (
  clientId: string,
  input: { pipelineId: string; contactId: string; stageId?: string; valueMinor?: number; currency?: string; note?: string },
): Promise<{ automations: AutomationRunOutcome[] }> =>
  call<{ automations: AutomationRunOutcome[] }>("pipelines/cards", clientId, {
    method: "POST", body: JSON.stringify(input),
  });

export interface MoveResponse { ok: true; board: JourneyBoard | null; automations: AutomationRunOutcome[] }

export const moveCard = (
  clientId: string,
  cardId: string,
  toStageId: string,
  toPosition?: number,
): Promise<MoveResponse> =>
  call<MoveResponse>("pipelines/cards/move", clientId, {
    method: "POST", body: JSON.stringify({ cardId, toStageId, toPosition }),
  });

export const updateCard = (
  clientId: string,
  cardId: string,
  patch: { valueMinor?: number | null; currency?: string; note?: string },
): Promise<unknown> =>
  call("pipelines/cards", clientId, { method: "PATCH", body: JSON.stringify({ cardId, patch }) });

export const removeCard = (clientId: string, cardId: string): Promise<unknown> =>
  call("pipelines/cards", clientId, { method: "DELETE", query: { cardId } });

export const fetchAutomations = (clientId: string, pipelineId?: string): Promise<{ automations: Automation[] }> =>
  call<{ automations: Automation[] }>("automations", clientId, { query: { pipelineId } });

export const createAutomation = (clientId: string, input: CreateAutomationInput): Promise<{ automation: Automation }> =>
  call<{ automation: Automation }>("automations", clientId, { method: "POST", body: JSON.stringify(input) });

export const updateAutomation = (clientId: string, id: string, patch: UpdateAutomationPatch): Promise<{ automation: Automation }> =>
  call<{ automation: Automation }>("automations", clientId, { method: "PATCH", body: JSON.stringify({ id, patch }) });

export const deleteAutomation = (clientId: string, id: string): Promise<unknown> =>
  call("automations", clientId, { method: "DELETE", query: { id } });

export interface ContactLite {
  id: string;
  email: string;
  name?: string;
  tags: string[];
  status: string;
}

export const fetchContacts = (clientId: string): Promise<{ contacts: ContactLite[] }> =>
  call<{ contacts: ContactLite[] }>("contacts", clientId);
