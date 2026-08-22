import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─── GitHub connects FROM THE PROJECTS SCREEN ────────────────────────────────
//
// Ed, blocked live: "its not letting me connect it up the auth and everything
// in the projects thats a big must". The server side already worked — the gap
// was that the projects screen only LINKED OUT to the Company page. These pin
// the inline flow so it cannot quietly regress into a link again.

const setup = readFileSync(
  join(process.cwd(), "src", "app", "portal", "dev-team", "editor", "setup", "_DevEditorSetup.tsx"),
  "utf8",
);

describe("connect GitHub without leaving the projects screen", () => {
  it("has an inline connect panel, not a link out to the Company page", () => {
    assert.match(setup, /function GitHubConnectPanel/);
    assert.doesNotMatch(setup, /company\?view=connections&integration=github/,
      "the old escape hatch — connecting must happen HERE");
  });

  it("saves through the one integrations route — no second connection store", () => {
    assert.match(setup, /\/api\/portal\/settings\/integrations/);
    assert.match(setup, /provider: "github"/);
  });

  it("tests the token immediately after saving — auth proven on the spot", () => {
    assert.match(setup, /action: "test", connectionId: saved\.connection\.id/);
    // A failed test is reported as saved-but-not-authenticating, never success.
    assert.match(setup, /Saved, but the token did not authenticate/);
  });

  it("treats the token as a secret: password input, never echoed, cleared on success", () => {
    assert.match(setup, /type="password" value=\{token\}/);
    assert.match(setup, /autoComplete="off"/);
    assert.match(setup, /setToken\(""\)/);
  });

  it("hands the new connection to the open draft and tells the editor", () => {
    assert.match(setup, /githubConnectionId: connectionId/);
    assert.match(setup, /DEV_PROJECTS_CHANGED_EVENT/);
  });
});

// ─── THE TREE STOPS SHOWING A CACHED REFUSAL ─────────────────────────────────
//
// Found live: the file tree said "Connect GitHub" from a 409 fetched once on
// mount, while the live GET had been answering 200 with 5,546 files — the
// connection had landed, and the tree never asked again. Two fixes, both
// pinned: the tree re-fetches when Settings announces a change, and the
// refusal itself carries a Try again button so the operator is never stuck
// behind a stale answer with no way to re-ask.

const canvas = readFileSync(join(process.cwd(), "src", "components", "editing", "EditorCodeCanvas.tsx"), "utf8");
const repoPanel = readFileSync(join(process.cwd(), "src", "components", "editing", "RepositoryPanel.tsx"), "utf8");
const codeWorkspace = readFileSync(join(process.cwd(), "src", "app", "portal", "agency", "development", "code", "_CodeWorkspace.tsx"), "utf8");
const githubSource = readFileSync(join(process.cwd(), "src", "engines", "editor", "server", "githubSource.ts"), "utf8");
const filesRoute = readFileSync(join(process.cwd(), "src", "app", "api", "portal", "site-editor", "files", "route.ts"), "utf8");

describe("the file tree re-fetches when a connection lands", () => {
  for (const [name, source] of [["EditorCodeCanvas", canvas], ["RepositoryPanel", repoPanel]] as const) {
    it(`${name} listens for DEV_PROJECTS_CHANGED_EVENT and re-runs the tree fetch`, () => {
      assert.match(source, /import \{ DEV_PROJECTS_CHANGED_EVENT \} from "@\/app\/portal\/dev-team\/editor\/setup\/_DevEditorSetup"/);
      assert.match(source, /window\.addEventListener\(DEV_PROJECTS_CHANGED_EVENT/);
      assert.match(source, /window\.removeEventListener\(DEV_PROJECTS_CHANGED_EVENT/, "…and cleans up after itself");
      // The listener bumps `refresh`, and the tree fetch depends on it — that
      // is the whole mechanism, so both halves are pinned.
      assert.match(source, /setRefresh\(value => value \+ 1\)/);
      assert.match(source, /\}, \[search, refresh\]\);/);
    });

    it(`${name} gives the refusal a Try again button`, () => {
      assert.match(source, /Try again/);
    });

    it(`${name} does not close the open file on a mere refresh`, () => {
      // Clearing the pane belongs to a TARGET change only; a refresh re-reads
      // the same repository under whatever is open.
      assert.match(source, /\}, \[search\]\);/, "the clear effect keys on search alone");
    });
  }
});

describe("nothing editor-side points at the Company page any more", () => {
  it("GitHubNotConfigured names the editor's Settings tab, not Company → Connections", () => {
    assert.doesNotMatch(githubSource, /Company → Connections/);
    assert.match(githubSource, /editor's Settings tab/);
  });

  it("the files route's fix-it link goes to the editor", () => {
    assert.doesNotMatch(filesRoute, /company\?view=connections/);
    assert.match(filesRoute, /href: "\/portal\/dev-team\/editor"/);
  });

  it("RepositoryPanel's refusal offers Try again, never a link out", () => {
    assert.doesNotMatch(repoPanel, /company\?view=connections/);
  });

  it("the Code workspace banner links to the editor, where the connect panel lives", () => {
    assert.doesNotMatch(codeWorkspace, /company\?view=connections/);
    assert.match(codeWorkspace, /\/portal\/dev-team\/editor/);
  });
});
