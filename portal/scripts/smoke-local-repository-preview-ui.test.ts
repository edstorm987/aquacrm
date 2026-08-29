import assert from "node:assert/strict";
import { test } from "node:test";

import { pollRepositoryPreviewTransition } from "../src/lib/shared/localRepositoryPreviewPolling";
import {
  localRepositoryPreviewUiReducer,
  type LocalRepositoryPreviewUiState,
} from "../src/lib/shared/localRepositoryPreviewUi";

test("repository preview repeats fake-timer polls through starting and stops at Preview ready", async () => {
  const controller = new AbortController();
  const delays: number[] = [];
  let calls = 0;
  await pollRepositoryPreviewTransition({
    initialState: "starting",
    signal: controller.signal,
    wait: async milliseconds => { delays.push(milliseconds); },
    requestStatus: async () => {
      calls += 1;
      return { projectId: "project_poll", state: calls === 1 ? "starting" : "healthy" };
    },
    onSnapshot: () => undefined,
  });

  assert.equal(calls, 2, "a slow restart is checked again after its first unchanged Starting snapshot");
  assert.deepEqual(delays, [800, 800]);
});

test("repository preview sends no further status requests after healthy or stopped", async () => {
  for (const initialState of ["healthy", "stopped"] as const) {
    let calls = 0;
    await pollRepositoryPreviewTransition({
      initialState,
      signal: new AbortController().signal,
      wait: async () => undefined,
      requestStatus: async () => {
        calls += 1;
        return { projectId: "project_settled", state: initialState };
      },
      onSnapshot: () => undefined,
    });
    assert.equal(calls, 0, `${initialState} is settled and must not keep POSTing status`);
  }
});

test("a stuck Start body is recovered by status without leaving the initiating UI idle or busy", () => {
  let state: LocalRepositoryPreviewUiState = {
    preview: { projectId: "project_start", state: "idle" },
    pending: null,
  };

  state = localRepositoryPreviewUiReducer(state, { type: "begin", id: 1, action: "start" });
  assert.equal(state.preview.state, "starting", "the click must paint Starting before response.json settles");
  assert.equal(state.pending?.id, 1, "the initiating request is still pending");

  const beforeStaleStatus = state;
  state = localRepositoryPreviewUiReducer(state, {
    type: "status",
    preview: { projectId: "project_start", state: "idle" },
  });
  assert.equal(state, beforeStaleStatus, "an older mount-status response cannot undo optimistic Start");

  state = localRepositoryPreviewUiReducer(state, {
    type: "status",
    preview: {
      projectId: "project_start",
      state: "healthy",
      startedAt: 20,
      previewUrl: "http://127.0.0.1:50120",
    },
  });
  assert.equal(state.preview.state, "healthy");
  assert.equal(state.pending, null, "status proof releases the disabled action state even if the Start body hangs");

  const afterStatusProof = state;
  state = localRepositoryPreviewUiReducer(state, {
    type: "response",
    id: 1,
    preview: { projectId: "project_start", state: "starting", startedAt: 20 },
  });
  assert.equal(state, afterStatusProof, "a late action body cannot regress a status-confirmed healthy preview");
});

test("Restart rejects the old generation and clears the old process's logs", () => {
  let state: LocalRepositoryPreviewUiState = {
    preview: {
      projectId: "project_restart",
      state: "healthy",
      startedAt: 10,
      previewUrl: "http://127.0.0.1:50110",
      logs: [{ at: 10, stream: "system", text: "old process" }],
    },
    pending: null,
  };

  state = localRepositoryPreviewUiReducer(state, { type: "begin", id: 2, action: "restart" });
  assert.equal(state.preview.state, "starting");
  assert.equal(state.preview.logs, undefined);

  const optimistic = state;
  state = localRepositoryPreviewUiReducer(state, {
    type: "status",
    preview: {
      projectId: "project_restart",
      state: "healthy",
      startedAt: 10,
      previewUrl: "http://127.0.0.1:50110",
    },
  });
  assert.equal(state, optimistic, "the previous process cannot falsely confirm Restart");

  state = localRepositoryPreviewUiReducer(state, {
    type: "status",
    preview: {
      projectId: "project_restart",
      state: "starting",
      startedAt: 30,
      previewUrl: "http://127.0.0.1:50130",
    },
  });
  assert.equal(state.preview.startedAt, 30);
  assert.equal(state.pending, null);
});

test("a stale transition status is retried instead of terminating the poll", async () => {
  let calls = 0;
  const states: string[] = [];
  await pollRepositoryPreviewTransition({
    initialState: "starting",
    signal: new AbortController().signal,
    wait: async () => undefined,
    requestStatus: async () => {
      calls += 1;
      if (calls === 1) return null;
      return {
        projectId: "project_race",
        state: calls === 2 ? "starting" : "healthy",
      };
    },
    onSnapshot: snapshot => { states.push(snapshot.state); },
  });
  assert.equal(calls, 3);
  assert.deepEqual(states, ["starting", "healthy"]);
});

// ─── Stale preview across a project switch (phase 17 failure path) ──────────
//
// Switching project resets this machine, but a status/response body for the
// PREVIOUS project can still be in flight. If it merges, the new project
// inherits the old one's lifecycle state and its loopback `previewUrl` — which
// the editor loads into its frame, showing project A's running site inside
// project B's editor. The component aborts those requests; these pin the same
// rule in the pure machine, where it is provable without a browser.

test("a late status for the PREVIOUS project cannot leak its preview URL into the new one", () => {
  let state: LocalRepositoryPreviewUiState = {
    preview: { projectId: "proj_a", state: "healthy", previewUrl: "http://127.0.0.1:41001", startedAt: 10 },
    pending: null,
  };

  // The operator switches to another project.
  state = localRepositoryPreviewUiReducer(state, { type: "reset", projectId: "proj_b" });
  assert.equal(state.preview.projectId, "proj_b");
  assert.equal(state.preview.state, "idle");
  assert.equal(state.preview.previewUrl, undefined);

  // Project A's poll, already in flight, lands after the switch.
  const leaked = localRepositoryPreviewUiReducer(state, {
    type: "status",
    preview: { projectId: "proj_a", state: "healthy", previewUrl: "http://127.0.0.1:41001", startedAt: 10 },
  });

  assert.equal(leaked.preview.projectId, "proj_b", "the machine stays on the project it was reset to");
  assert.equal(leaked.preview.state, "idle");
  assert.equal(leaked.preview.previewUrl, undefined, "project A's loopback URL must never reach project B");
  assert.equal(leaked, state, "an unrelated snapshot changes nothing at all");
});

test("a late Start RESPONSE for the previous project is dropped, not merged", () => {
  let state: LocalRepositoryPreviewUiState = {
    preview: { projectId: "proj_a", state: "idle" },
    pending: null,
  };
  state = localRepositoryPreviewUiReducer(state, { type: "begin", id: 1, action: "start" });
  assert.equal(state.preview.state, "starting");

  // The switch happens while that Start is still open.
  state = localRepositoryPreviewUiReducer(state, { type: "reset", projectId: "proj_b" });
  assert.equal(state.pending, null, "a reset also drops the pending action");

  const afterLateResponse = localRepositoryPreviewUiReducer(state, {
    type: "response",
    id: 1,
    preview: { projectId: "proj_a", state: "healthy", previewUrl: "http://127.0.0.1:41002", startedAt: 20 },
  });
  assert.equal(afterLateResponse.preview.previewUrl, undefined);
  assert.equal(afterLateResponse.preview.projectId, "proj_b");
});

test("the guard is about identity, not about rejecting real updates", () => {
  const state: LocalRepositoryPreviewUiState = {
    preview: { projectId: "proj_b", state: "starting", startedAt: 30 },
    pending: null,
  };
  const next = localRepositoryPreviewUiReducer(state, {
    type: "status",
    preview: { projectId: "proj_b", state: "healthy", previewUrl: "http://127.0.0.1:41003", startedAt: 30 },
  });
  assert.equal(next.preview.state, "healthy", "the current project's own progress still applies");
  assert.equal(next.preview.previewUrl, "http://127.0.0.1:41003");
});
