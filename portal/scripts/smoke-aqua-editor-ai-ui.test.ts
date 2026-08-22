// AQUA EDITOR AI — its own proper UI.
//
// Ed, verbatim: "it needs its own thing and its saved per project this one is
// please the chat history per project only limited to a project nothing else
// and needs its own proper ui for this".
//
// Phase 1 gave it its own token. Phase 2 gave it its own per-project history
// store. This is the interface, and it is the phase where the separation either
// becomes real on screen or quietly stops being real: a per-project store read
// by a client that writes back to the shared one would LOOK fixed.
//
// So the cases here are mostly about what the screen must NOT do:
//
//   1. NOT the Advisor's UI. No `AssistantWorkspace`, no `/api/assistant`.
//   2. NOT a second way to leak the key. The key input is write-only, the value
//      never comes back, and no request ever carries it in a URL.
//   3. NOT cross-project. Every call names a project; there is no listing.
//   4. NOT the dev workspace's clothes. No `--dt-*` tokens inside the editor,
//      a visible focus ring on every control, and a contrast floor on text.
//
// The client module (`editorAiClient.ts`) is driven for real against a stubbed
// `fetch`, so "never in a URL" is checked against the request that was actually
// made rather than against the source that was meant to make it.

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EDITOR_AI_ENDPOINT,
  EDITOR_AI_HISTORY_ENDPOINT,
  EDITOR_AI_REPLY_ENDPOINT,
  appendEditorAiMessage,
  clearEditorAiHistory,
  clearEditorAiKey,
  deleteEditorAiThread,
  readEditorAiHistory,
  readEditorAiStatus,
  renameEditorAiThread,
  requestEditorAiReply,
  saveEditorAiSettings,
  setEditorAiKey,
  startEditorAiThread,
} from "../src/components/editing/editorAiClient";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

/**
 * Source with comments removed.
 *
 * These files explain what they no longer use BY NAMING IT, in warnings telling
 * the next reader not to bring it back. A plain `includes` would match the
 * warning rather than the code it is warning about — the same trap Phases 1 and
 * 2 both hit, which is why the helper is copied rather than reinvented.
 */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PANEL = ["src", "components", "editing", "AquaEditorAI.tsx"] as const;
const THREAD = ["src", "components", "editing", "AquaEditorAIThread.tsx"] as const;
const KEY = ["src", "components", "editing", "AquaEditorAIKey.tsx"] as const;
const CLIENT = ["src", "components", "editing", "editorAiClient.ts"] as const;
const SKIN = ["src", "components", "editing", "editorAiSkin.ts"] as const;
const LOADER = ["src", "engines", "editor", "server", "editorAssistant.ts"] as const;

const UI_FILES = [PANEL, THREAD, KEY, CLIENT, SKIN];

// ── The fetch stub ──────────────────────────────────────────────────────────
//
// Captures what was really requested. `body` is kept as the raw string that
// went on the wire, because "the key is not in the URL" is only half the claim
// — the other half is what the request text actually contained.

interface Captured {
  url: string;
  method: string;
  body: string;
  parsed: Record<string, unknown>;
}

const realFetch = globalThis.fetch;

function stubFetch(payload: Record<string, unknown> = { ok: true }, status = 200): Captured[] {
  const calls: Captured[] = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? init.body : "";
    calls.push({
      url: String(input),
      method: String(init?.method ?? "GET"),
      body,
      parsed: body ? JSON.parse(body) as Record<string, unknown> : {},
    });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
    } as unknown as Response;
  }) as typeof fetch;
  return calls;
}

afterEach(() => { globalThis.fetch = realFetch; });

// A key shaped like a real one and obviously not one. Never a real credential.
const FAKE_KEY = "sk-test-NOT-A-REAL-KEY-000000000000abcd";

describe("Aqua Editor AI — its own interface, not the Advisor's", () => {
  it("does not mount AssistantWorkspace and does not call /api/assistant", () => {
    for (const parts of UI_FILES) {
      const source = code(read(...parts));
      assert.ok(
        !source.includes("AssistantWorkspace"),
        `${parts.join("/")} must not mount the Advisor's workspace`,
      );
      assert.ok(
        !source.includes("/api/assistant"),
        `${parts.join("/")} must not talk to the agency assistant's endpoint`,
      );
    }
  });

  it("talks to exactly three endpoints, and all are the editor's own", () => {
    assert.equal(EDITOR_AI_ENDPOINT, "/api/portal/dev/editor-ai");
    assert.equal(EDITOR_AI_HISTORY_ENDPOINT, "/api/portal/dev/editor-ai/history");
    assert.equal(EDITOR_AI_REPLY_ENDPOINT, "/api/portal/dev/editor-ai/reply");
    // Nothing else in the panel may open a connection of its own: one module
    // describes the two routes, so a third cannot appear by accident.
    for (const parts of [PANEL, THREAD, KEY]) {
      const source = code(read(...parts));
      assert.ok(!source.includes("fetch("), `${parts.join("/")} should go through editorAiClient, not fetch directly`);
    }
  });

  it("no longer loads the Advisor's per-person history, or the agency's radar", () => {
    const loader = code(read(...LOADER));
    for (const shared of ["getAssistantWorkspace", "assistantStore", "buildAssistantBusinessContext", "radarDigest"]) {
      assert.ok(!loader.includes(shared), `the props loader must not reach for ${shared}`);
    }
  });

  it("tells a wiring gap apart from a door that genuinely has no project", () => {
    // Two ways to reach the not-scoped state, and they are different problems.
    // The agency-portals door has no dev project at all; the studio door has one
    // and the mount has not named it yet. Saying "open a project" to somebody
    // who has one open would be a lie, so the panel distinguishes them by the
    // one field that answers it exactly.
    const panel = read(...PANEL);
    assert.match(panel, /const wiringGap = configured \|\| Boolean\(model\)/, "the model is the signal");
    const loader = read(...LOADER);
    assert.match(
      loader,
      /model: project \? editorAiModel\(agencyId, project\) : ""/,
      "which holds only because the loader blanks the model when no project resolved",
    );
  });

  it("hands the panel the project's NAME, so a screen can say what it is scoped to", () => {
    const loader = read(...LOADER);
    assert.match(loader, /projectName: string/, "the props carry the project's name");
    assert.match(loader, /projectName: found\?\.name \?\? ""/, "and it comes from the tenant-checked project");
    // TENANT FIRST, exactly as everywhere else in this feature.
    assert.match(loader, /getDevProject\(agencyId, requested\)/, "the agency is checked before the project");
  });
});

describe("Aqua Editor AI UI — every request is a POST, and nothing is in the URL", () => {
  it("posts every call, including the reads", async () => {
    // Both routes are POST-only on purpose: a GET is what gets logged with its
    // query string, cached, prefetched and pasted into a bug report, and one of
    // these two routes handles a credential.
    const calls = stubFetch({ ok: true, status: {}, conversation: null });
    await readEditorAiStatus("proj_1");
    await readEditorAiHistory("proj_1");
    await appendEditorAiMessage({ projectId: "proj_1", message: "hello" });
    await startEditorAiThread("proj_1");
    await renameEditorAiThread({ projectId: "proj_1", threadId: "t1", title: "x" });
    await deleteEditorAiThread({ projectId: "proj_1", threadId: "t1" });
    await clearEditorAiHistory("proj_1");
    await clearEditorAiKey("proj_1");
    await saveEditorAiSettings({ projectId: "proj_1", model: "m", instructions: "i" });
    await requestEditorAiReply({ projectId: "proj_1", threadId: "t1" });
    assert.equal(calls.length, 10);
    for (const call of calls) assert.equal(call.method, "POST", `${call.url} should be a POST`);
  });

  it("never puts a project id — or anything else — in a query string", async () => {
    const calls = stubFetch();
    await readEditorAiStatus("proj_secret");
    await readEditorAiHistory("proj_secret");
    await clearEditorAiHistory("proj_secret");
    await requestEditorAiReply({ projectId: "proj_secret", threadId: "t1" });
    for (const call of calls) {
      assert.ok(!call.url.includes("?"), `${call.url} must have no query string`);
      assert.ok(!call.url.includes("proj_secret"), "the project id belongs in the body, not the address");
      assert.ok(
        call.url === EDITOR_AI_ENDPOINT || call.url === EDITOR_AI_HISTORY_ENDPOINT || call.url === EDITOR_AI_REPLY_ENDPOINT,
        `${call.url} is not one of the editor's three endpoints`,
      );
    }
  });

  it("names a project on every single call — there is no listing that spans projects", async () => {
    const calls = stubFetch();
    await readEditorAiHistory("proj_1");
    await appendEditorAiMessage({ projectId: "proj_1", message: "hello" });
    await startEditorAiThread("proj_1");
    await renameEditorAiThread({ projectId: "proj_1", threadId: "t1", title: "x" });
    await deleteEditorAiThread({ projectId: "proj_1", threadId: "t1" });
    await clearEditorAiHistory("proj_1");
    await requestEditorAiReply({ projectId: "proj_1", threadId: "t1" });
    for (const call of calls) {
      assert.equal(call.parsed.projectId, "proj_1", `${String(call.parsed.action ?? "reply")} must name its project`);
    }
    // And the module offers no way to ask for anything wider. A "my
    // conversations" call is the exact shape Ed asked to have removed, so it
    // must not exist on the client either.
    const client = code(read(...CLIENT));
    for (const wider of ["\"list\"", "list-conversations", "listEditorAi"]) {
      assert.ok(!client.includes(wider), `${wider} would be a view across projects`);
    }
  });

  it("clears ONE project's history, through the history route", async () => {
    const calls = stubFetch();
    await clearEditorAiHistory("proj_1");
    assert.equal(calls[0].url, EDITOR_AI_HISTORY_ENDPOINT);
    assert.equal(calls[0].parsed.action, "clear");
    assert.equal(calls[0].parsed.projectId, "proj_1");
  });

  it("surfaces the SERVER's sentence on a refusal, not one it invented", async () => {
    stubFetch({ ok: false, error: "That project could not be found." }, 404);
    await assert.rejects(
      () => readEditorAiHistory("proj_from_another_agency"),
      /That project could not be found\./,
      "the route's own wording — a foreign id and an invented one say the same thing",
    );
  });

  it("does not pass a non-JSON or non-ok response off as success", async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new Error("not json"); },
    } as unknown as Response)) as typeof fetch;
    await assert.rejects(() => readEditorAiStatus("proj_1"), /could not be completed/);
  });
});

describe("Aqua Editor AI UI — the key is write-only", () => {
  it("sends the key in the request BODY, and never in the address", async () => {
    const calls = stubFetch();
    await setEditorAiKey({ projectId: "proj_1", apiKey: FAKE_KEY, model: "m", instructions: "i" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, EDITOR_AI_ENDPOINT, "no query string, no key in the address");
    assert.ok(!calls[0].url.includes(FAKE_KEY));
    assert.equal(calls[0].parsed.action, "set-token");
    assert.equal(calls[0].parsed.apiKey, FAKE_KEY);
  });

  it("is the ONLY call that carries a key", async () => {
    // `save` is model-and-brief. The route ignores an `apiKey` sent to it, and
    // the client refuses to send one, so the panel cannot grow a second way to
    // write a credential.
    const calls = stubFetch();
    await saveEditorAiSettings({ projectId: "proj_1", model: FAKE_KEY, instructions: "i" });
    await clearEditorAiKey("proj_1");
    await readEditorAiStatus("proj_1");
    await appendEditorAiMessage({ projectId: "proj_1", message: FAKE_KEY });
    for (const call of calls) {
      assert.equal(call.parsed.apiKey, undefined, `${String(call.parsed.action)} must not carry a key field`);
    }
    // The model field carrying key-shaped text is the caller's business; what
    // matters is that no request declares it AS a credential.
    assert.equal(calls[1].parsed.action, "clear-token");
  });

  it("keeps the key out of the input, out of state, and out of anything read back", () => {
    const panel = read(...KEY);
    // Write-only field: a password input, no autocomplete, and never seeded
    // from the masked hint.
    assert.match(panel, /type="password"/, "the key field must not be a plain text box");
    assert.match(panel, /autoComplete="off"/, "a browser must not be invited to store it elsewhere");
    assert.ok(
      !/value=\{[^}]*tokenHint/.test(panel),
      "the masked hint must never be loaded into the key input — it is a hint, not a value",
    );
    // Emptied the moment a save succeeds, before anything re-renders with it.
    assert.match(panel, /setApiKey\(""\)/, "the pasted key must not outlive the request");
    // The only thing about a key this screen may render is the masked tail.
    assert.match(panel, /status\.tokenHint/, "the masked tail is what identifies which key is on the project");
  });

  it("shows a NOT CONFIGURED state that says what to do", () => {
    const panel = read(...KEY);
    assert.match(panel, /Not configured/, "the off state is named, not implied by an empty panel");
    assert.match(panel, /encrypted into the integrations vault/, "and it says where the key goes");
    const thread = read(...THREAD);
    assert.match(thread, /Set this project&apos;s key/, "the conversation offers the way out of the off state");
    // A composer that looks usable and fails on send is worse than a disabled
    // one: the gate is the project's own key.
    assert.match(thread, /disabled=\{!configured \|\| busy \|\| !projectId\}/);
  });
});

describe("Aqua Editor AI UI — the reply is real now, and honest about itself", () => {
  it("no longer wears the 'cannot reply yet' banner — the reply path replaced it", () => {
    const thread = code(read(...THREAD));
    assert.ok(!thread.includes("cannot reply yet"), "the honest gap is closed, so its banner must be gone");
    assert.ok(thread.includes("requestEditorAiReply"), "…because the reply round-trip is wired in its place");
    // What replaced it is the other honesty: a reply DESCRIBES, a person applies.
    assert.match(read(...THREAD), /You decide what to apply/, "the you-decide framing survives the wiring");
  });

  it("shows a thinking state that always ends in words — never a spinner that lies", () => {
    const thread = read(...THREAD);
    assert.match(thread, /setThinking\(true\)/, "the wait is visible");
    assert.match(thread, /finally \{\s*setThinking\(false\)/, "and it ALWAYS ends — the reply client never throws");
    // The client's own abort, over the server's: a dead network becomes words.
    const client = read(...CLIENT);
    assert.match(client, /REPLY_WAIT_MS/, "the browser stops waiting on its own clock too");
    assert.match(client, /"timeout"/, "…and calls the result what it is");
  });

  it("asks through the reply endpoint, naming the project, the thread and the context", async () => {
    const calls = stubFetch({
      ok: true,
      message: { id: "m1", role: "assistant", content: "Change it to X.", createdAt: 1 },
      threadId: "t1",
      conversation: null,
    });
    const result = await requestEditorAiReply({ projectId: "proj_1", threadId: "t1", context: "I clicked a <h1>." });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, EDITOR_AI_REPLY_ENDPOINT);
    assert.equal(calls[0].parsed.projectId, "proj_1");
    assert.equal(calls[0].parsed.threadId, "t1");
    assert.equal(calls[0].parsed.context, "I clicked a <h1>.");
    assert.ok(result.ok, "a message back is a reply");
    assert.equal(result.ok && result.message.content, "Change it to X.");
  });

  it("returns a failure as a VALUE with the server's code — the panel can point at the Key panel", async () => {
    stubFetch({ ok: false, error: "Aqua Editor AI has no key for this project yet.", code: "not_configured" }, 409);
    const result = await requestEditorAiReply({ projectId: "proj_1", threadId: "t1" });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.code, "not_configured");
    assert.equal(!result.ok && result.error, "Aqua Editor AI has no key for this project yet.");
    // …and the thread screen acts on exactly that code.
    const thread = read(...THREAD);
    assert.match(thread, /code === "not_configured"/, "the code is read, not the sentence");
    assert.match(thread, /Open the Key panel/, "and the way out is one click");
  });

  it("turns an unreachable network into words rather than a throw or a hang", async () => {
    globalThis.fetch = (async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch;
    const result = await requestEditorAiReply({ projectId: "proj_1", threadId: "t1" });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.code, "network");
    assert.match(!result.ok ? result.error : "", /message is saved/, "it says the message survived");
  });

  it("does not restore a SAVED message into the composer when only the reply fails", () => {
    // The draft is restored when the SAVE failed (losing typed words is the
    // worse failure) — but a reply failure must not put a copy of an
    // already-saved message back in the box, or send would post it twice.
    const thread = read(...THREAD);
    assert.match(thread, /setDraft\(message\);\s*setError\(cause instanceof Error/, "save failure restores the draft");
    // From the reply CALL onwards (lastIndexOf: the first occurrence is the
    // import), nothing may write the sent message back into the box.
    const replyHalf = thread.slice(thread.lastIndexOf("requestEditorAiReply"));
    assert.ok(!replyHalf.includes("setDraft(message)"), "reply failure must not restore an already-saved draft");
  });
});

describe("Aqua Editor AI UI — per project, and it says so", () => {
  it("shows which project the conversation belongs to", () => {
    const thread = read(...THREAD);
    assert.match(thread, /projectName/, "the project is named on screen, not just in the request");
    assert.match(
      thread,
      /belongs to\{" "\}/,
      "the empty state says the conversation belongs to this project",
    );
    const panel = read(...PANEL);
    assert.match(panel, /\{projectName \|\| "This project"\}/, "and the header badge carries it too");
  });

  it("refetches when the project changes, rather than showing the previous one's messages", () => {
    // The editor's project selector sits in the top bar and changes project
    // without a navigation, so the server-rendered conversation can be the
    // PREVIOUS project's. Showing it for even a frame is the exact bleed this
    // whole feature exists to remove.
    const thread = read(...THREAD);
    assert.match(
      thread,
      /initialConversation\?\.projectId === projectId \? initialConversation : null/,
      "the seeded conversation is used only when it is genuinely this project's",
    );
    assert.match(thread, /readEditorAiHistory\(projectId\)/, "and the project's own history is read");
    assert.match(thread, /\}, \[projectId\]\);/, "keyed on the project, so a change refetches");
  });

  it("does not inherit the previous project's gate when the editor changes project", () => {
    // The editor's project selector changes project without a navigation, so
    // the server-rendered `configured` belongs to the project the PAGE was
    // opened on. Carrying it over would leave an enabled composer on a project
    // with no key of its own — the exact thing "a seperate tocken" prevents.
    const panel = read(...PANEL);
    assert.match(
      panel,
      /const rendered = editorAi\?\.projectId \?\? ""/,
      "the panel knows WHICH project the server's answer was about",
    );
    assert.match(
      panel,
      /projectId === rendered \? configured : false/,
      "and reports OFF for any other project until its own status lands",
    );
    assert.match(panel, /readEditorAiStatus\(projectId\)/, "which it then asks for");
  });

  it("offers a clear control scoped to this project, behind a confirmation", () => {
    const thread = read(...THREAD);
    assert.match(thread, /Clear this project&apos;s history/, "the control says what it clears");
    assert.match(thread, /confirmClear/, "and it is two steps — the record is removed, not emptied");
    assert.match(thread, /clearEditorAiHistory\(projectId\)/, "one project, named");
  });

  it("does not carry a half-typed message across a project change", () => {
    // Keeping the composer would post what was written about project A into
    // project B's history the moment somebody pressed send.
    const thread = read(...THREAD);
    assert.match(thread, /if \(stale\) \{[\s\S]{0,600}?setDraft\(""\);/, "the composer is cleared with the conversation");
  });

  it("will not save a brief it has never read", () => {
    // `save` treats an empty `instructions` as "clear the brief". A panel that
    // submitted a box the server had not yet filled would delete somebody's
    // instructions on their behalf, so the forms stay shut until it has.
    const panel = read(...KEY);
    assert.match(panel, /const unread = status\?\.projectId !== projectId/, "it knows when it has not been told");
    assert.ok(
      (panel.match(/\|\| unread/g) ?? []).length >= 4,
      "and every control in both forms is gated on it",
    );
  });

  it("seeds its fields idempotently — React 19 invokes an effect twice on mount", () => {
    // A consumable boolean would be spent by the first invocation. A value
    // compare gives the same answer however many times it runs, and it also
    // stops a save's own re-render from wiping the notice that save just set.
    const panel = read(...KEY);
    assert.match(panel, /seededFor\.current === answered\) return/, "the guard is a value compare, not a one-shot");
  });

  it("reports the cap rather than letting a conversation quietly get shorter", () => {
    const thread = read(...THREAD);
    assert.match(thread, /evictedMessages/, "the trim counter is read");
    assert.match(thread, /trimmed to keep this/, "and turned into a sentence somebody can read");
  });

  it("keeps the element-selection capture working, and visible", () => {
    // Ed: "for the ai i just need broswer aqua tagged so the element section
    // works and then you just differ it to the ai". The click must still land
    // in the composer, and it must be VISIBLE that it landed.
    const panel = read(...PANEL);
    assert.match(panel, /onPickElement/, "the studio's picker is reused, not rebuilt");
    assert.match(panel, /Its exact text is/, "the clicked words are quoted, not summarised");
    assert.match(panel, /You clicked &lt;\{context\.words\.tagName\}&gt; on the page/, "and the capture is shown");
    assert.match(panel, /composerTools/, "the capture strip sits with the composer");
    const thread = read(...THREAD);
    assert.match(thread, /if \(prefill\) setDraft\(prefill\)/, "a capture loads into the box, and is not sent");
  });
});

describe("Aqua Editor AI UI — the editor's clothes, not the dev workspace's", () => {
  it("uses no --dt-* token anywhere", () => {
    // Ed's complaint: panels dropped into the editor arrive wearing
    // `/portal/dev-team`'s design tokens. Those belong to the dev workspace.
    // Comments stripped: `editorAiSkin.ts` states the rule by naming the thing
    // it forbids, which is exactly what makes the rule findable.
    for (const parts of UI_FILES) {
      assert.ok(!code(read(...parts)).includes("--dt-"), `${parts.join("/")} must not use the dev workspace's tokens`);
    }
  });

  it("takes its accent from the editor's own --mode-accent", () => {
    const skin = read(...SKIN);
    assert.match(skin, /var\(--mode-accent/, "the panel repaints with the editor's depth");
    const panel = read(...PANEL);
    assert.match(panel, /accentStyle/, "and the root declares it");
  });

  it("gives every interactive element a visible keyboard focus state", () => {
    const skin = read(...SKIN);
    assert.match(skin, /focus-visible:ring-2/, "a ring, because outline-none alone loses the caret");
    // Every control in the three components carries it. Counted rather than
    // spot-checked: one button added without it is one keyboard user lost.
    for (const parts of [PANEL, THREAD, KEY]) {
      const source = read(...parts);
      const controls = (source.match(/<(?:button|input|textarea)\b/g) ?? []).length;
      const focused = (source.match(/FOCUS_RING/g) ?? []).length;
      assert.ok(controls > 0, `${parts.join("/")} has no controls?`);
      // The hidden file input is deliberately unfocusable — it is opened by the
      // visible button beside it, which does carry the ring.
      assert.ok(
        focused >= controls - 1,
        `${parts.join("/")}: ${controls} controls but only ${focused} focus rings`,
      );
    }
  });

  it("keeps text above the AA contrast floor on the editor's dark panel", () => {
    // White at 45% over `#141614` is about 4.4:1 — under AA for normal text,
    // and everything in this panel is 10–12px, which is normal text. So nothing
    // below 50% is used for a word anybody has to read.
    for (const parts of UI_FILES) {
      const source = read(...parts);
      for (const match of source.matchAll(/text-white\/(\d+)/g)) {
        assert.ok(
          Number(match[1]) >= 50,
          `${parts.join("/")}: ${match[0]} is below the contrast floor on a dark panel`,
        );
      }
    }
  });

  it("still proposes rather than applies — nothing here writes to the site", () => {
    for (const parts of [PANEL, THREAD, KEY]) {
      const source = code(read(...parts));
      for (const write of ["site-editor/files", "action: \"save-draft\"", "dev/projects"]) {
        assert.ok(!source.includes(write), `${parts.join("/")} must not write through ${write}`);
      }
    }
  });
});

// ─── The stale-panel render, in a child process ─────────────────────────────
//
// `react-dom/server` does not resolve under the suite's `--conditions
// react-server`, so the render runs as a plain Node process — the same
// pattern as `smoke-portal-element-parity.harness.tsx` — and this file
// asserts over the HTML it prints.

function renderStaleKeyPanel(): { stale: string; fresh: string } {
  const env = { ...process.env };
  const nodeOptions = (env.NODE_OPTIONS ?? "").replace(/--conditions[= ]react-server/g, "").trim();
  if (nodeOptions) env.NODE_OPTIONS = nodeOptions;
  else delete env.NODE_OPTIONS;
  const stdout = execFileSync(process.execPath, [
    join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"),
    join(__dirname, "smoke-aqua-editor-ai-stale-key-panel.harness.tsx"),
  ], { env, encoding: "utf8", cwd: ROOT, maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(stdout) as { stale: string; fresh: string };
}

describe("Aqua Editor AI UI — a switched project never wears the previous project's facts", () => {
  // Project A's answer, rendered under project B's id — the one-round-trip
  // window after an in-editor project switch. Every value below is a
  // credential fact from the STALE status, planted by the harness so it is
  // unmistakable in the HTML.
  const A_FACTS = [
    "••••a4f2",                        // A's masked key tail
    "Aqua Editor AI — Project A",      // A's vault connection label
    "gpt-model-of-project-a",          // A's model
    "briefed-only-for-project-a",      // A's brief
    "reason-sentence-about-project-a", // A's status sentence
    "Key set",                         // A's configured state
  ];

  it("renders NONE of the stale status's credential facts, and says it is reading", () => {
    const { stale, fresh } = renderStaleKeyPanel();

    for (const fact of A_FACTS) {
      assert.ok(!stale.includes(fact), `project B's panel must not show "${fact}" — that is project A's`);
    }
    // Not "Not configured" either. Unread means UNKNOWN: claiming B is
    // unconfigured is as much a guess about it as showing A's key tail.
    assert.ok(!stale.includes("Not configured"), "unread is unknown, not 'not configured'");
    assert.ok(stale.includes("Reading this project"), "the honest state is 'still reading'");

    // The control: the SAME status rendered for its own project shows every
    // fact — proving each assertion above is genuinely capable of failing.
    for (const fact of A_FACTS) {
      assert.ok(fresh.includes(fact), `the fresh render should show "${fact}", or this test checks nothing`);
    }
  });
});
