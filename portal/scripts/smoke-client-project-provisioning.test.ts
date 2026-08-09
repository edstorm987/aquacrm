import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { after, before, describe, it } from "node:test";

const require = createRequire(import.meta.url);
const tempRoot = mkdtempSync(path.join(tmpdir(), "milesymedia-client-project-"));

before(() => {
  const serverOnlyPath = require.resolve("server-only");
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
    children: [],
    paths: [],
  } as NodeJS.Module;
  process.env.CLIENT_PROJECTS_ROOT = tempRoot;
});

after(() => {
  delete process.env.CLIENT_PROJECTS_ROOT;
  rmSync(tempRoot, { force: true, recursive: true });
});

describe("client project provisioning", () => {
  it("creates a complete editable site and clean local Git repository", async () => {
    const { provisionClientProject } = await import("../src/lib/server/clientProjectProvisioner");
    const project = provisionClientProject({
      clientId: "cli_test",
      clientName: "Aster & Co",
      clientSlug: "aster-and-co",
      clientEmail: "studio@aster.example",
      projectName: "Aster & Co Website",
      starterId: "luxury-service-site",
      aquaOrigin: "http://localhost:3030/",
      propertyId: "prop_test",
    });

    assert.equal(project.projectSlug, "aster-co-website");
    assert.ok(project.localPath.startsWith(tempRoot));
    assert.equal(project.propertyId, "prop_test");
    assert.match(project.initialCommit, /^[a-f0-9]{40}$/);

    for (const file of [
      "index.html",
      "styles.css",
      "script.js",
      "assets/hero.jpg",
      "aqua.config.json",
      "vercel.json",
      "README.md",
      ".gitignore",
    ]) {
      assert.ok(existsSync(path.join(project.localPath, file)), `${file} should exist`);
    }
    assert.ok(statSync(path.join(project.localPath, "assets/hero.jpg")).size > 100_000);

    const html = readFileSync(path.join(project.localPath, "index.html"), "utf8");
    assert.match(html, /Aster & Co/);
    assert.match(html, /data-client-id="cli_test"/);
    assert.match(html, /data-property-id="prop_test"/);
    assert.match(html, /http:\/\/localhost:3030\/aqua-tag\.js/);
    assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}/);

    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: project.localPath,
      encoding: "utf8",
    });
    assert.equal(status, "");
    const branch = execFileSync("git", ["branch", "--show-current"], {
      cwd: project.localPath,
      encoding: "utf8",
    }).trim();
    assert.equal(branch, "main");
  });

  it("never overwrites an existing client project", async () => {
    const { provisionClientProject } = await import("../src/lib/server/clientProjectProvisioner");
    const first = provisionClientProject({
      clientId: "cli_repeat",
      clientName: "Repeat Studio",
      clientSlug: "repeat-studio",
      projectName: "Main website",
      starterId: "luxury-service-site",
      aquaOrigin: "http://localhost:3030",
    });
    const second = provisionClientProject({
      clientId: "cli_repeat",
      clientName: "Repeat Studio",
      clientSlug: "repeat-studio",
      projectName: "Main website",
      starterId: "luxury-service-site",
      aquaOrigin: "http://localhost:3030",
    });

    assert.equal(first.projectSlug, "main-website");
    assert.equal(second.projectSlug, "main-website-2");
    assert.notEqual(first.localPath, second.localPath);
  });

  it("keeps previews tenant-scoped while allowing the assigned customer", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/app/client-site-preview/[clientId]/[propertyId]/[[...assetPath]]/route.ts"),
      "utf8",
    );
    assert.match(source, /requireRoleForClient\(\[\.\.\.AGENCY_ROLES, \.\.\.CLIENT_ROLES, "end-customer"\], clientId\)/);
    assert.match(source, /session\.agencyId, clientId/);
    assert.match(source, /requestedPath\.startsWith\(`\$\{projectRoot\}\$\{sep\}`\)/);
    assert.match(source, /"x-robots-tag": "noindex, nofollow"/);
  });

  it("wires provision, GitHub publish and Vercel deploy actions to tenant-scoped routes", () => {
    const routeRoot = path.join(process.cwd(), "src/app/api/tenants/client-projects");
    const provision = readFileSync(path.join(routeRoot, "provision/route.ts"), "utf8");
    const publish = readFileSync(path.join(routeRoot, "publish/route.ts"), "utf8");
    const deploy = readFileSync(path.join(routeRoot, "deploy/route.ts"), "utf8");

    for (const source of [provision, publish, deploy]) {
      assert.match(source, /requireRoleForClient\(\[\.\.\.AGENCY_ROLES\], clientId\)/);
      assert.match(source, /getClientForAgency\(session\.agencyId, clientId\)/);
      assert.match(source, /flushPendingWrites\(\)/);
      assert.doesNotMatch(source, /GITHUB_TOKEN|VERCEL_TOKEN/);
    }
    assert.match(provision, /provisionClientProject\(/);
    assert.match(publish, /publishProjectToGitHub\(\{[\s\S]*agencyId: session\.agencyId,[\s\S]*clientId,/);
    assert.match(deploy, /deployProjectPreviewToVercel\(\{[\s\S]*agencyId: session\.agencyId,[\s\S]*clientId,/);
  });

  it("publishes privately without storing a GitHub token in the remote", async () => {
    const { publishProjectToGitHub } = await import("../src/lib/server/githubProjectPublisher");
    const localPath = path.join(tempRoot, "publish-client", "publish-site");
    mkdirSync(localPath, { recursive: true });
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const gitCalls: Array<{ args: string[]; env?: Record<string, string | undefined> }> = [];
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith("/user")) {
        return new Response(JSON.stringify({ login: "edstorm987" }), { status: 200 });
      }
      return new Response(JSON.stringify({
        clone_url: "https://github.com/edstorm987/publish-site.git",
        full_name: "edstorm987/publish-site",
        html_url: "https://github.com/edstorm987/publish-site",
        owner: { login: "edstorm987" },
        private: true,
      }), { status: 201 });
    };
    const runGit = (args: string[], env?: Record<string, string | undefined>) => {
      gitCalls.push({ args, env });
      if (args.join(" ") === "remote get-url origin") throw new Error("no origin");
      return "";
    };

    const published = await publishProjectToGitHub({
      localPath,
      projectSlug: "publish-site",
      description: "Private client site",
      config: { token: "fresh-test-token", owner: "edstorm987" },
    }, { fetchImpl: fetchImpl as typeof fetch, runGit });

    assert.equal(published.private, true);
    assert.equal(published.repoUrl, "https://github.com/edstorm987/publish-site");
    const create = requests.find(request => request.url.endsWith("/user/repos"));
    assert.ok(create);
    assert.equal(JSON.parse(String(create.init?.body)).private, true);
    assert.equal((create.init?.headers as Record<string, string>).authorization, "Bearer fresh-test-token");
    assert.deepEqual(gitCalls[1]?.args, ["remote", "add", "origin", "https://github.com/edstorm987/publish-site.git"]);
    assert.deepEqual(gitCalls[2]?.args, ["push", "-u", "origin", "main"]);
    assert.ok(gitCalls[2]?.env?.GIT_CONFIG_VALUE_0?.startsWith("Authorization: Basic "));
    assert.ok(gitCalls.every(call => !call.args.join(" ").includes("fresh-test-token")));
  });

  it("uploads project files and creates a Vercel review deployment", async () => {
    const { deployProjectPreviewToVercel } = await import("../src/lib/server/vercelProjectDeployer");
    const localPath = path.join(tempRoot, "deploy-client", "deploy-site");
    mkdirSync(path.join(localPath, "assets"), { recursive: true });
    mkdirSync(path.join(localPath, ".git"), { recursive: true });
    writeFileSync(path.join(localPath, "index.html"), "<h1>Ready</h1>");
    writeFileSync(path.join(localPath, "assets", "site.css"), "body { color: black; }");
    writeFileSync(path.join(localPath, ".git", "secret"), "never upload");
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.includes("/v2/files")) return new Response("{}", { status: 200 });
      return new Response(JSON.stringify({
        created: 1_700_000_000_000,
        id: "dpl_test",
        name: "deploy-site",
        readyState: "QUEUED",
        url: "deploy-site-test.vercel.app",
      }), { status: 201 });
    };

    const deployment = await deployProjectPreviewToVercel({
      localPath,
      projectSlug: "deploy-site",
      config: { token: "vercel-test-token", teamId: "team_test" },
    }, { fetchImpl: fetchImpl as typeof fetch });

    assert.equal(deployment.previewUrl, "https://deploy-site-test.vercel.app");
    assert.equal(deployment.fileCount, 2);
    assert.equal(requests.filter(request => request.url.includes("/v2/files")).length, 2);
    assert.ok(requests.every(request => request.url.endsWith("?teamId=team_test")));
    const create = requests.find(request => request.url.includes("/v13/deployments"));
    assert.ok(create);
    const body = JSON.parse(String(create.init?.body));
    assert.equal(body.target, "preview");
    assert.equal(body.projectSettings.framework, null);
    assert.deepEqual(body.files.map((file: { file: string }) => file.file).sort(), ["assets/site.css", "index.html"]);
    assert.ok(!String(create.init?.body).includes("vercel-test-token"));
  });
});
