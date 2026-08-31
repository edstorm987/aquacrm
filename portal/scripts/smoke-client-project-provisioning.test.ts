process.env.PORTAL_BACKEND ??= "memory";

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
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
    const { provisionClientProject } = await import("../src/lib/server/clients/clientProjectProvisioner");
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
    const { provisionClientProject } = await import("../src/lib/server/clients/clientProjectProvisioner");
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

  it("re-enters the folder an unfinished provision owns instead of minting a -2 sibling", async () => {
    const {
      clientProjectDirectory,
      planClientProject,
      provisionClientProject,
    } = await import("../src/lib/server/clients/clientProjectProvisioner");
    const identity = {
      clientName: "Resume Studio",
      clientSlug: "resume-studio",
      projectName: "Main website",
    };
    const plan = planClientProject(identity);
    assert.equal(plan.adopted, false);
    const created = provisionClientProject({
      clientId: "cli_resume",
      ...identity,
      starterId: "luxury-service-site",
      aquaOrigin: "http://localhost:3030",
      propertyId: plan.propertyId,
    }, plan);

    // The client record save is lost here. The durable operation still owns the
    // slug, folder and property id, so the retry must re-enter them. Without
    // that adoption the very same request suffixes into a `-2` sibling:
    assert.equal(planClientProject(identity).projectSlug, "main-website-2");

    const retryPlan = planClientProject({
      ...identity,
      adopt: { propertyId: plan.propertyId, projectSlug: plan.projectSlug, localPath: plan.localPath },
    });
    assert.equal(retryPlan.adopted, true);
    assert.equal(retryPlan.localPath, created.localPath);
    const retried = provisionClientProject({
      clientId: "cli_resume",
      ...identity,
      starterId: "luxury-service-site",
      aquaOrigin: "http://localhost:3030",
      propertyId: retryPlan.propertyId,
    }, retryPlan);

    assert.equal(retried.localPath, created.localPath);
    assert.equal(retried.propertyId, created.propertyId);
    assert.equal(retried.projectSlug, created.projectSlug);
    assert.match(retried.initialCommit, /^[a-f0-9]{40}$/);
    assert.deepEqual(readdirSync(clientProjectDirectory(identity)), [plan.projectSlug]);
  });

  it("steps aside instead of writing over a folder a concurrent provision claimed", async () => {
    const {
      clientProjectDirectory,
      planClientProject,
      provisionClientProject,
    } = await import("../src/lib/server/clients/clientProjectProvisioner");
    const identity = {
      clientName: "Race Studio",
      clientSlug: "race-studio",
      projectName: "Main website",
    };
    // Both requests plan the same free name; the durable record is written
    // between planning and creating, so the loser now runs with a stale plan.
    const first = planClientProject(identity);
    const second = planClientProject(identity);
    assert.equal(first.localPath, second.localPath);
    assert.equal(second.adopted, false);

    const winner = provisionClientProject({
      clientId: "cli_race",
      ...identity,
      starterId: "luxury-service-site",
      aquaOrigin: "http://localhost:3030",
      propertyId: first.propertyId,
    }, first);
    const winnerCommit = winner.initialCommit;
    const winnerHtml = readFileSync(path.join(winner.localPath, "index.html"), "utf8");

    const loser = provisionClientProject({
      clientId: "cli_race",
      ...identity,
      starterId: "luxury-service-site",
      aquaOrigin: "http://localhost:3030",
      propertyId: second.propertyId,
    }, second);

    // The loser must NOT have merged its starter over the winner's project, and
    // must not have deleted it on the way out either.
    assert.notEqual(loser.localPath, winner.localPath);
    assert.equal(loser.projectSlug, "main-website-2");
    assert.ok(existsSync(winner.localPath), "the winner's folder survives the loser");
    assert.equal(readFileSync(path.join(winner.localPath, "index.html"), "utf8"), winnerHtml);
    assert.equal(
      execFileSync("git", ["rev-parse", "HEAD"], { cwd: winner.localPath, encoding: "utf8" }).trim(),
      winnerCommit,
      "no second commit was laid on top of the winner's repository",
    );
    assert.deepEqual(
      readdirSync(clientProjectDirectory(identity)).sort(),
      ["main-website", "main-website-2"],
    );
  });

  it("does not adopt — and so does not delete — a folder the operation only intended", async () => {
    const route = readFileSync(
      path.join(process.cwd(), "src/app/api/tenants/client-projects/provision/route.ts"),
      "utf8",
    );
    // Adoption deletes and rebuilds what it adopts, so only a milestone that
    // actually landed ("external-created") may be adopted.
    assert.match(route, /resumable\?\.status === "external-created"/);
    assert.match(route, /adopt: adoptable\s*\n?\s*\?/);
    // And the milestone records the folder that was really built, not the plan.
    assert.match(route, /await operation\.record\(\{[\s\S]*localPath: workspace\.localPath,/);
  });

  it("keeps a client-project operation durable across a lost save and stops adopting once it succeeds", async () => {
    const {
      beginClientProjectOperation,
      clientProjectOperationKey,
      getClientProjectOperation,
      resumableClientProjectOperation,
    } = await import("../src/server/clientProjectOperations");
    const { ensureHydrated } = await import("../src/server/storage");
    await ensureHydrated();

    const key = clientProjectOperationKey("deploy", "agc_ops", "cli_ops", "prop_ops");
    assert.equal(resumableClientProjectOperation(key), undefined);
    const first = await beginClientProjectOperation({
      key,
      kind: "deploy",
      agencyId: "agc_ops",
      clientId: "cli_ops",
      intent: { propertyId: "prop_ops" },
    });
    // The intent is durable BEFORE anything external happens.
    assert.equal(getClientProjectOperation(key)?.status, "pending");
    await first.record({ deploymentId: "dpl_ops", previewUrl: "https://ops.vercel.app" });
    await first.fail(new Error("Deployment record could not be saved."));

    const stored = getClientProjectOperation(key);
    assert.equal(stored?.status, "external-created");
    assert.equal(stored?.deploymentId, "dpl_ops");
    assert.equal(stored?.lastError, "Deployment record could not be saved.");

    const retry = await beginClientProjectOperation({
      key,
      kind: "deploy",
      agencyId: "agc_ops",
      clientId: "cli_ops",
      intent: { propertyId: "prop_ops" },
    });
    assert.equal(retry.operation.deploymentId, "dpl_ops");
    assert.equal(retry.operation.attempts, 2);
    await retry.succeed();

    // A finished operation is never adopted again: deploying once more is a new
    // deployment, not a resumed one.
    assert.equal(resumableClientProjectOperation(key), undefined);
    const fresh = await beginClientProjectOperation({
      key,
      kind: "deploy",
      agencyId: "agc_ops",
      clientId: "cli_ops",
      intent: { propertyId: "prop_ops" },
    });
    assert.equal(fresh.operation.deploymentId, undefined);
    assert.equal(fresh.operation.status, "pending");
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

  it("records a durable operation before each external side effect and fails it on a lost save", () => {
    const routeRoot = path.join(process.cwd(), "src/app/api/tenants/client-projects");
    const provision = readFileSync(path.join(routeRoot, "provision/route.ts"), "utf8");
    const publish = readFileSync(path.join(routeRoot, "publish/route.ts"), "utf8");
    const deploy = readFileSync(path.join(routeRoot, "deploy/route.ts"), "utf8");

    for (const [name, source] of Object.entries({ provision, publish, deploy })) {
      assert.match(source, /resumableClientProjectOperation\(operationKey\)/, `${name} must consult the recorded operation`);
      assert.match(source, /await beginClientProjectOperation\(/, `${name} must record intent before acting`);
      assert.match(source, /await operation\.fail\(/, `${name} must record the failure, keeping its milestones`);
      assert.match(source, /await operation\.succeed\(\)/, `${name} must close the operation`);
      // The lost-save path is exactly the one that used to orphan the external thing.
      assert.match(
        source,
        /await operation\.fail\(new Error\("(Project|Repository|Deployment) record could not be saved\."\)\);\n\s*return NextResponse\.json/,
        `${name} must fail the operation when the record cannot be saved`,
      );
    }
    // Intent first, side effect second — in that order in the source.
    assert.ok(provision.indexOf("beginClientProjectOperation({") < provision.indexOf("provisionClientProject({"));
    assert.ok(publish.indexOf("beginClientProjectOperation({") < publish.indexOf("publishProjectToGitHub({"));
    assert.ok(deploy.indexOf("beginClientProjectOperation({") < deploy.indexOf("deployProjectPreviewToVercel({"));
    assert.match(publish, /adoptRepository: resumable\?\.repoFullName/);
    assert.match(publish, /onRepositoryCreated: created => operation\.record\(/);
    assert.match(deploy, /adoptDeploymentId: resumable\?\.deploymentId/);
    assert.match(deploy, /onDeploymentCreated: created => operation\.record\(/);
  });

  it("publishes privately without storing a GitHub token in the remote", async () => {
    const { publishProjectToGitHub } = await import("../src/lib/server/integrations/githubProjectPublisher");
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

  it("adopts the repository an unfinished publish already created instead of creating a second one", async () => {
    const { publishProjectToGitHub } = await import("../src/lib/server/integrations/githubProjectPublisher");
    const localPath = path.join(tempRoot, "resume-publish-client", "resume-site");
    mkdirSync(localPath, { recursive: true });
    const repository = {
      clone_url: "https://github.com/edstorm987/resume-site.git",
      full_name: "edstorm987/resume-site",
      html_url: "https://github.com/edstorm987/resume-site",
      owner: { login: "edstorm987" },
      private: true,
    };
    let creates = 0;
    let lookups = 0;
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/user")) return new Response(JSON.stringify({ login: "edstorm987" }), { status: 200 });
      if (url.endsWith("/user/repos")) {
        creates += 1;
        return new Response(JSON.stringify(repository), { status: 201 });
      }
      if (url.endsWith("/repos/edstorm987/resume-site")) {
        lookups += 1;
        return new Response(JSON.stringify(repository), { status: 200 });
      }
      throw new Error(`unexpected GitHub call ${url}`);
    };
    const config = { token: "resume-token", owner: "edstorm987" };
    const recorded: Array<{ fullName: string }> = [];

    // Attempt one: GitHub creates the repository, then the push dies.
    await assert.rejects(publishProjectToGitHub({
      localPath,
      projectSlug: "resume-site",
      description: "Private client site",
      config,
      onRepositoryCreated: created => { recorded.push({ fullName: created.fullName }); },
    }, {
      fetchImpl: fetchImpl as typeof fetch,
      runGit: (args: string[]) => {
        if (args[0] === "push") throw new Error("push failed");
        if (args.join(" ") === "remote get-url origin") throw new Error("no origin");
        return "";
      },
    }), /push failed/);
    // The repository was recorded BEFORE the push, so nothing was orphaned.
    assert.equal(creates, 1);
    assert.deepEqual(recorded, [{ fullName: "edstorm987/resume-site" }]);

    // Attempt two adopts it: no second repository, and the push completes.
    const published = await publishProjectToGitHub({
      localPath,
      projectSlug: "resume-site",
      description: "Private client site",
      config,
      adoptRepository: { fullName: recorded[0].fullName },
    }, {
      fetchImpl: fetchImpl as typeof fetch,
      runGit: (args: string[]) => {
        if (args.join(" ") === "remote get-url origin") throw new Error("no origin");
        return "";
      },
    });
    assert.equal(creates, 1);
    assert.equal(lookups, 1);
    assert.equal(published.fullName, "edstorm987/resume-site");
    assert.equal(published.repoUrl, "https://github.com/edstorm987/resume-site");
  });

  it("reconciles a colliding repository name rather than failing the publish", async () => {
    const { publishProjectToGitHub } = await import("../src/lib/server/integrations/githubProjectPublisher");
    const localPath = path.join(tempRoot, "collide-publish-client", "collide-site");
    mkdirSync(localPath, { recursive: true });
    let creates = 0;
    let lookups = 0;
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/user")) return new Response(JSON.stringify({ login: "edstorm987" }), { status: 200 });
      if (url.endsWith("/user/repos")) {
        creates += 1;
        return new Response(JSON.stringify({ message: "name already exists on this account" }), { status: 422 });
      }
      if (url.endsWith("/repos/edstorm987/collide-site")) {
        lookups += 1;
        return new Response(JSON.stringify({
          clone_url: "https://github.com/edstorm987/collide-site.git",
          full_name: "edstorm987/collide-site",
          html_url: "https://github.com/edstorm987/collide-site",
          owner: { login: "edstorm987" },
          private: true,
        }), { status: 200 });
      }
      throw new Error(`unexpected GitHub call ${url}`);
    };

    const published = await publishProjectToGitHub({
      localPath,
      projectSlug: "collide-site",
      description: "Private client site",
      config: { token: "collide-token", owner: "edstorm987" },
    }, {
      fetchImpl: fetchImpl as typeof fetch,
      runGit: (args: string[]) => {
        if (args.join(" ") === "remote get-url origin") throw new Error("no origin");
        return "";
      },
    });
    assert.equal(creates, 1);
    assert.equal(lookups, 1);
    assert.equal(published.fullName, "edstorm987/collide-site");
  });

  it("uploads project files and creates a Vercel review deployment", async () => {
    const { deployProjectPreviewToVercel } = await import("../src/lib/server/integrations/vercelProjectDeployer");
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

  it("adopts a recorded deployment instead of stacking a second preview", async () => {
    const { deployProjectPreviewToVercel } = await import("../src/lib/server/integrations/vercelProjectDeployer");
    const localPath = path.join(tempRoot, "resume-deploy-client", "resume-deploy-site");
    mkdirSync(localPath, { recursive: true });
    writeFileSync(path.join(localPath, "index.html"), "<h1>Ready</h1>");
    const body = {
      created: 1_700_000_000_000,
      id: "dpl_resume",
      name: "resume-deploy-site",
      readyState: "QUEUED",
      url: "resume-deploy-site.vercel.app",
    };
    let creates = 0;
    let uploads = 0;
    let lookups = 0;
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/v2/files")) {
        uploads += 1;
        return new Response("{}", { status: 200 });
      }
      if (url.includes("/v13/deployments/dpl_resume")) {
        lookups += 1;
        return new Response(JSON.stringify(body), { status: 200 });
      }
      if (init?.method === "POST") {
        creates += 1;
        return new Response(JSON.stringify(body), { status: 201 });
      }
      throw new Error(`unexpected Vercel call ${url}`);
    };
    const config = { token: "vercel-resume-token" };
    const recorded: string[] = [];

    const first = await deployProjectPreviewToVercel({
      localPath,
      projectSlug: "resume-deploy-site",
      config,
      onDeploymentCreated: created => { recorded.push(created.deploymentId); },
    }, { fetchImpl: fetchImpl as typeof fetch });
    assert.equal(creates, 1);
    assert.equal(uploads, 1);
    // Recorded before the caller ever sees it, so a lost save leaves an id.
    assert.deepEqual(recorded, ["dpl_resume"]);

    // The client record save is lost here; the retry must reuse that id.
    const retried = await deployProjectPreviewToVercel({
      localPath,
      projectSlug: "resume-deploy-site",
      config,
      adoptDeploymentId: recorded[0],
      onDeploymentCreated: created => { recorded.push(created.deploymentId); },
    }, { fetchImpl: fetchImpl as typeof fetch });

    assert.equal(creates, 1);
    assert.equal(uploads, 1);
    assert.equal(lookups, 1);
    assert.equal(retried.deploymentId, first.deploymentId);
    assert.equal(retried.previewUrl, first.previewUrl);
    assert.deepEqual(recorded, ["dpl_resume", "dpl_resume"]);
  });
});
