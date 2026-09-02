import type { ClientRadarSnapshot } from "@/engines/data/radar/businessRadar";

export type ClientRadarReadPhase = "loading" | "ready" | "unavailable";

export interface ClientRadarReadState {
  phase: ClientRadarReadPhase;
  snapshot: ClientRadarSnapshot;
  activeRequestId: number | null;
  message: string;
}

export type ClientRadarReadAction =
  | { type: "begin"; requestId: number }
  | { type: "succeed"; requestId: number; snapshot: ClientRadarSnapshot }
  | { type: "fail"; requestId: number; message: string }
  | { type: "hydrate"; snapshot: ClientRadarSnapshot };

export function initialClientRadarReadState(snapshot: ClientRadarSnapshot): ClientRadarReadState {
  return { phase: "ready", snapshot, activeRequestId: null, message: "" };
}

/**
 * Keep last-confirmed Radar visible while a refresh is pending or unavailable,
 * and ignore any response that belongs to an older/cancelled request.
 */
export function reduceClientRadarRead(
  state: ClientRadarReadState,
  action: ClientRadarReadAction,
): ClientRadarReadState {
  if (action.type === "begin") {
    return { ...state, phase: "loading", activeRequestId: action.requestId, message: "" };
  }
  if (action.type === "hydrate") {
    if (action.snapshot.generatedAt < state.snapshot.generatedAt) return state;
    return { phase: "ready", snapshot: action.snapshot, activeRequestId: null, message: "" };
  }
  if (action.requestId !== state.activeRequestId) return state;
  if (action.type === "fail") {
    return { ...state, phase: "unavailable", activeRequestId: null, message: action.message };
  }
  if (action.snapshot.generatedAt < state.snapshot.generatedAt) {
    return { ...state, phase: "ready", activeRequestId: null, message: "" };
  }
  return { phase: "ready", snapshot: action.snapshot, activeRequestId: null, message: "" };
}
