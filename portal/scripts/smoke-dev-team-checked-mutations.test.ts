import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { checkedDevTeamMutation } from "../src/app/portal/dev-team/_checkedMutation";
import { isProjectMutationPayload } from "../src/app/portal/dev-team/_projectMutationPayload";

function fetcher(response: Response): typeof fetch {
  return async () => response;
}

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function between(text: string, start: string, end: string): string {
  const startAt = text.indexOf(start);
  const endAt = text.indexOf(end, startAt + start.length);
  assert.ok(startAt >= 0, `missing start marker: ${start}`);
  assert.ok(endAt > startAt, `missing end marker: ${end}`);
  return text.slice(startAt, endAt);
}

function assertRefusalGuard(block: string, successEffect: RegExp, label: string): void {
  const refusalAt = block.indexOf("if (!result.ok)");
  const successAt = block.search(successEffect);
  assert.ok(refusalAt >= 0, `${label} has no explicit refusal guard`);
  assert.ok(successAt > refusalAt, `${label} can run its success effect before refusing the mutation`);
  assert.match(block.slice(refusalAt, successAt), /return;/, `${label} does not return before its success effect`);
}

describe("Dev Team checked mutation result", () => {
  it("keeps project save, delete and map success shapes action-specific", async () => {
    const project = {
      id: "project_1",
      agencyId: "agency_1",
      name: "AquaCRM",
      repository: "",
      ref: "main",
    };
    const status = {
      repoMapped: true,
      tagged: false,
      tagVerified: false,
      browserAvailable: false,
      neverMapped: false,
      missing: ["No Aqua Tag connected."],
      tagState: "none",
      tagSentence: "No Aqua Tag connected.",
    };

    assert.equal(isProjectMutationPayload({ ok: true, projects: [] }, "save"), false);
    assert.equal(isProjectMutationPayload({ ok: true, project: "saved" }, "save"), false);
    assert.equal(isProjectMutationPayload({ ok: true, project }, "save", project.id), true);
    assert.equal(isProjectMutationPayload({ ok: true, project }, "save", "another_project"), false);
    assert.equal(isProjectMutationPayload({ ok: true, projects: [] }, "delete", project.id), true);
    assert.equal(isProjectMutationPayload({ ok: true, projects: [project] }, "delete", project.id), false);
    assert.equal(isProjectMutationPayload({ ok: true, project }, "map", project.id), false);
    assert.equal(isProjectMutationPayload({ ok: true, project, status }, "map", project.id), true);

    const result = await checkedDevTeamMutation<{ ok?: boolean; projects?: unknown[] }>(
      "/api/portal/dev/projects",
      { method: "POST" },
      {
        fallback: "That could not be saved.",
        fetcher: fetcher(Response.json({ ok: true, projects: [] })),
        validate: value => isProjectMutationPayload(value, "save"),
      },
    );
    assert.deepEqual(result, {
      ok: false,
      error: "That could not be saved.",
      payload: { ok: true, projects: [] },
    });
  });

  it("returns a safe retryable transport diagnostic", async () => {
    const result = await checkedDevTeamMutation<{ ok?: boolean }>("/dev-team", { method: "POST" }, {
      fallback: "Could not save the document.",
      fetcher: async () => { throw new TypeError("socket details must not reach the UI"); },
    });

    assert.deepEqual(result, {
      ok: false,
      error: "Could not save the document. Check your connection and try again.",
    });
  });

  it("rejects unreadable JSON without exposing parser details", async () => {
    const result = await checkedDevTeamMutation<{ ok?: boolean }>("/dev-team", { method: "PATCH" }, {
      fallback: "That didn't save.",
      fetcher: fetcher(new Response("<!doctype html>gateway", { status: 200 })),
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /server returned an unreadable response/i);
      assert.doesNotMatch(result.error, /Unexpected token|JSON|doctype/i);
    }
  });

  it("rejects a non-2xx response and keeps its safe server diagnostic", async () => {
    const payload = { ok: false, error: "That roadmap item changed. Reload and retry." };
    const result = await checkedDevTeamMutation<{ ok?: boolean }>("/dev-team", { method: "DELETE" }, {
      fallback: "That couldn't be removed.",
      fetcher: fetcher(Response.json(payload, { status: 409 })),
    });

    assert.deepEqual(result, {
      ok: false,
      error: "That roadmap item changed. Reload and retry.",
      payload,
    });
  });

  it("rejects a 2xx domain refusal and an invalid success payload", async () => {
    const refused = await checkedDevTeamMutation<{ ok?: boolean }>("/dev-team", { method: "POST" }, {
      fallback: "Could not create the plan.",
      fetcher: fetcher(Response.json({ ok: false, error: "That plan already exists." })),
    });
    assert.deepEqual(refused, {
      ok: false,
      error: "That plan already exists.",
      payload: { ok: false, error: "That plan already exists." },
    });

    const invalid = await checkedDevTeamMutation<{ ok?: boolean; item?: unknown }>("/dev-team", { method: "POST" }, {
      fallback: "That didn't save.",
      fetcher: fetcher(Response.json({ ok: true })),
      validate: value => value.ok === true && Boolean(value.item),
    });
    assert.deepEqual(invalid, {
      ok: false,
      error: "That didn't save.",
      payload: { ok: true },
    });
  });
});

describe("mounted Dev Team document controls", () => {
  it("keeps all three roadmap mutations behind the checked boundary", () => {
    const roadmap = source("src/app/portal/dev-team/roadmap/_RoadmapWorkspace.tsx");
    assert.match(roadmap, /checkedDevTeamMutation<RoadmapWritePayload>/);
    assert.doesNotMatch(roadmap, /await\s+fetch\s*\(/);
    for (const method of ["POST", "PATCH", "DELETE"]) {
      assert.match(roadmap, new RegExp(`send\\(\"${method}\"`), `${method} must use the shared writer`);
    }

    const save = between(roadmap, "  async function save()", "  // Two taps to remove");
    const remove = between(roadmap, "  async function remove()", "\n\n  return (");
    const add = between(roadmap, "  async function add()", "\n\n  if (!open)");
    assertRefusalGuard(save, /setEditing\(false\)/, "roadmap edit");
    assertRefusalGuard(remove, /setConfirming\(false\)/, "roadmap delete");
    assertRefusalGuard(add, /setTitle\(\"\"\)/, "roadmap create");
    for (const block of [save, remove, add]) {
      assertRefusalGuard(block, /router\.refresh\(\)/, "roadmap refresh");
    }
  });

  it("keeps document and plan drafts mounted when a write is refused", () => {
    const editor = source("src/app/portal/dev-team/docs/_DocEditor.tsx");
    const plan = source("src/app/portal/dev-team/plans/new/_NewPlanForm.tsx");
    for (const [label, text] of [["document editor", editor], ["plan creator", plan]] as const) {
      assert.match(text, /checkedDevTeamMutation/);
      assert.doesNotMatch(text, /await\s+fetch\s*\(/);
      assert.match(text, /finally\s*\{\s*setBusy\(false\)/s, `${label} must always settle its busy state`);
    }

    const save = between(editor, "  async function save()", "\n\n  return (");
    const submit = between(plan, "  async function submit", "\n\n  if (created)");
    assertRefusalGuard(save, /setSaved\(true\)/, "document editor");
    assertRefusalGuard(save, /router\.refresh\(\)/, "document editor refresh");
    assertRefusalGuard(submit, /setCreated\(/, "plan creator");
    assertRefusalGuard(submit, /router\.refresh\(\)/, "plan creator refresh");
  });

  it("inventories every remaining raw fetch as an explicit read", () => {
    const root = join(process.cwd(), "src/app/portal/dev-team");
    const files = readdirSync(root, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name))
      .map(entry => join(entry.parentPath, entry.name));
    const rawFetches = files.flatMap(file => {
      const text = readFileSync(file, "utf8");
      return [...text.matchAll(/\bfetch\s*\(/g)].map(match => ({ file, text, at: match.index }));
    });

    assert.equal(rawFetches.length, 4, "a mounted Dev Team fetch was added or removed without updating the read inventory");
    for (const fetchCall of rawFetches) {
      const relative = fetchCall.file.slice(root.length + 1);
      const lineEnd = fetchCall.text.indexOf("\n", fetchCall.at);
      const line = fetchCall.text.slice(fetchCall.at, lineEnd < 0 ? undefined : lineEnd);
      if (relative === "editor/setup/_DevEditorSetup.tsx") {
        assert.equal(line, 'fetch("/api/portal/dev/projects", { cache: "no-store" })');
      } else if (relative === "findings/_FindingsWorkspace.tsx") {
        assert.equal(line, 'fetch("/api/portal/dev-team/findings").then(r => r.json()).catch(() => null);');
      } else if (relative === "working/_LiveWorkers.tsx") {
        assert.equal(line, 'fetch("/api/portal/dev-team/workers", { cache: "no-store" });');
      } else {
        assert.fail(`unreviewed raw fetch in mounted Dev Team file: ${relative}`);
      }
    }
  });

  it("keeps the complete mounted Dev Team write cohort on the checked boundary", () => {
    const cohort = [
      "src/app/portal/dev-team/roadmap/_RoadmapWorkspace.tsx",
      "src/app/portal/dev-team/docs/_DocEditor.tsx",
      "src/app/portal/dev-team/plans/new/_NewPlanForm.tsx",
      "src/app/portal/dev-team/findings/_FindingsWorkspace.tsx",
      "src/app/portal/dev-team/updates/_UpdateComposer.tsx",
      "src/app/portal/dev-team/tasks/_TasksWorkspace.tsx",
      "src/app/portal/dev-team/editor/_AppConfigEditor.tsx",
      "src/app/portal/dev-team/editor/setup/_DevEditorSetup.tsx",
      "src/app/portal/dev-team/inspector/InspectorClient.tsx",
    ];
    for (const file of cohort) {
      assert.match(source(file), /checked(?:DevTeam|Project)Mutation/, `${file} bypassed the checked boundary`);
    }

    const findings = source("src/app/portal/dev-team/findings/_FindingsWorkspace.tsx");
    assert.equal([...findings.matchAll(/checkedDevTeamMutation</g)].length, 3);
    assert.ok([...findings.matchAll(/finally\s*\{/g)].length >= 3, "all finding writers must settle pending state");

    const setup = source("src/app/portal/dev-team/editor/setup/_DevEditorSetup.tsx");
    assert.equal([...setup.matchAll(/method:\s*"POST"/g)].length, 3, "project helper plus integration save/test are the only POST definitions");
    assert.ok([...setup.matchAll(/finally\s*\{/g)].length >= 7, "all setup writers must settle pending state");

    const inspector = source("src/app/portal/dev-team/inspector/InspectorClient.tsx");
    assert.match(inspector, /finally\s*\{\s*setBusy\(null\)/s);
    assert.match(inspector, /if \(!result\.ok\)[\s\S]*setError\(result\.error\)[\s\S]*return;/);
    assert.match(inspector, /\^\\\/\(\?!\\\/\)\/\.test\(value\)/,
      "a protocol-relative redirect must not pass the Inspector success validator");
    assert.match(inspector, /!value\.includes\("\\\\"\)/,
      "a backslash-normalised cross-origin redirect must not pass the Inspector validator");
    assert.match(inspector, /isLocalRedirect\(value\.redirect\)/,
      "location.assign must only receive a redirect accepted by the local-path validator");
  });
});
