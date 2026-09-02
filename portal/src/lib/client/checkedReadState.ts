export type CheckedReadPhase = "loading" | "ready" | "unavailable";

/**
 * Client-side state for a consequential read whose scope can change while a
 * request is in flight. The last confirmed value is retained, but the
 * requested scope is kept separately so old evidence is never relabelled as
 * the new scope. Request ids make late responses inert.
 */
export interface CheckedReadState<T, Scope extends string = string> {
  phase: CheckedReadPhase;
  value: T;
  hasConfirmedValue: boolean;
  confirmedScope: Scope;
  requestedScope: Scope;
  activeRequestId: number | null;
  error: string;
}

export type CheckedReadAction<T, Scope extends string = string> =
  | { type: "begin"; requestId: number; scope: Scope }
  | { type: "succeed"; requestId: number; scope: Scope; value: T }
  | { type: "fail"; requestId: number; scope: Scope; error: string }
  | { type: "replace-confirmed"; value: T }
  | { type: "update-confirmed"; update: (current: T) => T };

export function confirmedCheckedRead<T, Scope extends string>(scope: Scope, value: T): CheckedReadState<T, Scope> {
  return {
    phase: "ready",
    value,
    hasConfirmedValue: true,
    confirmedScope: scope,
    requestedScope: scope,
    activeRequestId: null,
    error: "",
  };
}

export function pendingCheckedRead<T, Scope extends string>(scope: Scope, fallback: T): CheckedReadState<T, Scope> {
  return {
    phase: "loading",
    value: fallback,
    hasConfirmedValue: false,
    confirmedScope: scope,
    requestedScope: scope,
    activeRequestId: null,
    error: "",
  };
}

export function checkedReadReducer<T, Scope extends string>(
  state: CheckedReadState<T, Scope>,
  action: CheckedReadAction<T, Scope>,
): CheckedReadState<T, Scope> {
  if (action.type === "begin") {
    return {
      ...state,
      phase: "loading",
      requestedScope: action.scope,
      activeRequestId: action.requestId,
      error: "",
    };
  }

  if (action.type === "replace-confirmed") {
    if (state.phase !== "ready") return state;
    return { ...state, value: action.value };
  }

  if (action.type === "update-confirmed") {
    if (state.phase !== "ready") return state;
    return { ...state, value: action.update(state.value) };
  }

  // A response may only settle the request that is still active. This check
  // covers both scope switches and an ordinary retry overtaking its precursor.
  if (action.requestId !== state.activeRequestId || action.scope !== state.requestedScope) return state;

  if (action.type === "succeed") {
    return {
      phase: "ready",
      value: action.value,
      hasConfirmedValue: true,
      confirmedScope: action.scope,
      requestedScope: action.scope,
      activeRequestId: null,
      error: "",
    };
  }

  return {
    ...state,
    phase: "unavailable",
    activeRequestId: null,
    error: action.error,
  };
}

export function checkedReadIsCurrent<T, Scope extends string>(state: CheckedReadState<T, Scope>): boolean {
  return state.phase === "ready" && state.confirmedScope === state.requestedScope;
}

export function checkedReadHasRetainedSnapshot<T, Scope extends string>(state: CheckedReadState<T, Scope>): boolean {
  return !checkedReadIsCurrent(state) && state.hasConfirmedValue;
}
