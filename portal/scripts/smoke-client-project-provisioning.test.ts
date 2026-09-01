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
    const requestHash = "resume_request_hash";
    const recoveryToken = "resume-recovery-token";
    assert.equal(plan.adopted, false);
    const created = provisionClientProject({
      clientId: "cli_resume",
      ...identity,
      starterId: "luxury-service-site",
      aquaOrigin: "http://localhost:3030",
      propertyId: plan.propertyId,
      requestHash,
      recoveryToken,
    }, plan);
    const userEdit = path.join(created.localPath, "user-edit.txt");
    writeFileSync(userEdit, "preserve this uncommitted edit\n");

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
      requestHash,
      recoveryToken,
    }, retryPlan);

    assert.equal(retried.localPath, created.localPath);
    assert.equal(retried.propertyId, created.propertyId);
    assert.equal(retried.projectSlug, created.projectSlug);
    assert.match(retried.initialCommit, /^[a-f0-9]{40}$/);
    assert.equal(readFileSync(userEdit, "utf8"), "preserve this uncommitted edit\n");
    assert.match(
      execFileSync("git", ["status", "--porcelain"], { cwd: retried.localPath, encoding: "utf8" }),
      /\?\? user-edit\.txt/,
      "retry adopts the complete repository without cleaning user work",
    );
    assert.deepEqual(readdirSync(clientProjectDirectory(identity)), [plan.projectSlug]);
  });

  it("cleans and retries the same provision after folder-copy and initial-commit crashes", async () => {
    const {
      clientProjectDirectory,
      planClientProject,
      provisionClientProject,
    } = await import("../src/lib/server/clients/clientProjectProvisioner");

    for (const failurePoint of ["folder", "commit"] as const) {
      const identity = {
        clientName: `Fault ${failurePoint} Studio`,
        clientSlug: `fault-${failurePoint}-studio`,
        projectName: "Main website",
      };
      const plan = planClientProject(identity);
      const input = {
        clientId: `cli_fault_${failurePoint}`,
        ...identity,
        starterId: "luxury-service-site" as const,
        aquaOrigin: "http://localhost:3030",
        propertyId: plan.propertyId,
        requestHash: `fault_${failurePoint}_request`,
        recoveryToken: `fault-${failurePoint}-recovery`,
      };
      assert.throws(() => provisionClientProject(input, plan, {
        afterFolderCreated: failurePoint === "folder"
          ? () => { throw new Error("crash after folder creation"); }
          : undefined,
        afterInitialCommit: failurePoint === "commit"
          ? () => { throw new Error("crash after initial commit"); }
          : undefined,
      }), new RegExp(`crash after ${failurePoint === "folder" ? "folder creation" : "initial commit"}`));
      assert.equal(existsSync(plan.localPath), false, `${failurePoint} failure must clean the partial folder`);
      assert.equal(
        readdirSync(clientProjectDirectory(identity)).some(entry => entry.startsWith(".aqua-staging-")),
        false,
        `${failurePoint} failure must clean only its owned staging artifacts`,
      );

      // The durable intent remains stable; retrying it recreates exactly one
      // folder/property at the original name instead of minting a sibling.
      const retryPlan = planClientProject({
        ...identity,
        adopt: { propertyId: plan.propertyId, projectSlug: plan.projectSlug, localPath: plan.localPath },
      });
      const recovered = provisionClientProject(input, retryPlan);
      assert.equal(recovered.localPath, plan.localPath);
      assert.equal(recovered.propertyId, plan.propertyId);
      assert.deepEqual(readdirSync(clientProjectDirectory(identity)), ["main-website"]);
    }
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

  it("atomically steps aside when a folder is claimed after the preflight check", async () => {
    const {
      clientProjectDirectory,
      planClientProject,
      provisionClientProject,
    } = await import("../src/lib/server/clients/clientProjectProvisioner");
    const identity = {
      clientName: "Atomic Race Studio",
      clientSlug: "atomic-race-studio",
      projectName: "Main website",
    };
    const plan = planClientProject(identity);
    const sentinel = path.join(plan.localPath, "claimed-by-other-operation.txt");
    const recovered = provisionClientProject({
      clientId: "cli_atomic_race",
      ...identity,
      starterId: "luxury-service-site",
      aquaOrigin: "http://localhost:3030",
      propertyId: plan.propertyId,
    }, plan, {
      beforeFolderClaim: localPath => {
        mkdirSync(localPath);
        writeFileSync(sentinel, "preserve me");
      },
    });

    assert.equal(readFileSync(sentinel, "utf8"), "preserve me");
    assert.equal(recovered.projectSlug, "main-website-2");
    assert.notEqual(recovered.localPath, plan.localPath);
    assert.deepEqual(
      readdirSync(clientProjectDirectory(identity)).sort(),
      ["main-website", "main-website-2"],
    );
  });

  it("reuses durable provision intent without deleting a folder another operation claimed", async () => {
    const {
      clientProjectDirectory,
      planClientProject,
      provisionClientProject,
    } = await import("../src/lib/server/clients/clientProjectProvisioner");
    const identity = {
      clientName: "Intent Race Studio",
      clientSlug: "intent-race-studio",
      projectName: "Main website",
    };
    const intended = planClientProject(identity);
    const claimant = provisionClientProject({
      clientId: "cli_claimant",
      ...identity,
      starterId: "luxury-service-site",
      aquaOrigin: "http://localhost:3030",
      propertyId: "prop_claimant",
    }, { ...intended, propertyId: "prop_claimant" });
    const claimantHtml = readFileSync(path.join(claimant.localPath, "index.html"), "utf8");

    // The durable intent survived but its milestone did not. Route-level retry
    // adopts that intent; the provisioner must inspect the generated identity
    // before deleting anything and step aside when another operation owns it.
    const recovered = provisionClientProject({
      clientId: "cli_intended",
      ...identity,
      starterId: "luxury-service-site",
      aquaOrigin: "http://localhost:3030",
      propertyId: intended.propertyId,
    }, { ...intended, adopted: true });

    assert.equal(recovered.projectSlug, "main-website-2");
    assert.notEqual(recovered.localPath, claimant.localPath);
    assert.equal(readFileSync(path.join(claimant.localPath, "index.html"), "utf8"), claimantHtml);
    assert.deepEqual(
      readdirSync(clientProjectDirectory(identity)).sort(),
      ["main-website", "main-website-2"],
    );

    const route = readFileSync(
      path.join(process.cwd(), "src/app/api/tenants/client-projects/provision/route.ts"),
      "utf8",
    );
    assert.match(route, /resumable\?\.propertyId && resumable\.projectSlug && resumable\.localPath/);
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
      requestHash: "deploy_request_hash",
      intent: { propertyId: "prop_ops" },
    });
    const recoveryToken = first.operation.recoveryToken;
    assert.match(recoveryToken ?? "", /^[a-f0-9-]{36}$/);
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
      requestHash: "deploy_request_hash",
      intent: { propertyId: "prop_ops" },
    });
    assert.equal(retry.operation.deploymentId, "dpl_ops");
    assert.equal(retry.operation.attempts, 2);
    assert.equal(retry.operation.recoveryToken, recoveryToken);
    await retry.succeed();

    // A finished operation is never adopted again: deploying once more is a new
    // deployment, not a resumed one.
    assert.equal(resumableClientProjectOperation(key), undefined);
    const fresh = await beginClientProjectOperation({
      key,
      kind: "deploy",
      agencyId: "agc_ops",
      clientId: "cli_ops",
      requestHash: "deploy_request_hash",
      intent: { propertyId: "prop_ops" },
    });
    assert.equal(fresh.operation.deploymentId, undefined);
    assert.equal(fresh.operation.status, "pending");
    assert.equal(fresh.operation.attempts, 1);
    assert.notEqual(fresh.operation.recoveryToken, recoveryToken);
  });

  it("binds an unfinished operation to one immutable request body", async () => {
    const {
      beginClientProjectOperation,
      ClientProjectOperationConflictError,
      clientProjectRequestHash,
      createPortalClientProjectOperationRuntime,
    } = await import("../src/server/clientProjectOperations");
    const operations = new Map<string, import("../src/server/types").ClientProjectOperation>();
    const runtime = createPortalClientProjectOperationRuntime({
      readOperation: key => operations.get(key),
      writeOperation: (key, operation) => { operations.set(key, operation); },
      flush: async () => undefined,
      now: () => 1_700_000_000_000,
    });
    const firstHash = clientProjectRequestHash({
      kind: "provision",
      agencyId: "agc_hash",
      clientId: "cli_hash",
      request: { projectName: "Main website", starterId: "luxury-service-site" },
    });
    const changedBodyHash = clientProjectRequestHash({
      kind: "provision",
      agencyId: "agc_hash",
      clientId: "cli_hash",
      request: { projectName: "Main website", starterId: "different-starter" },
    });
    const first = await beginClientProjectOperation({
      key: "same-operation-key",
      kind: "provision",
      agencyId: "agc_hash",
      clientId: "cli_hash",
      requestHash: firstHash,
      intent: { propertyId: "prop_hash" },
    }, runtime);
    await first.fail(new Error("simulated crash"));

    await assert.rejects(
      beginClientProjectOperation({
        key: "same-operation-key",
        kind: "provision",
        agencyId: "agc_hash",
        clientId: "cli_hash",
        requestHash: changedBodyHash,
        intent: { propertyId: "prop_changed" },
      }, runtime),
      (error: unknown) => error instanceof ClientProjectOperationConflictError && error.status === 409,
    );
    assert.equal(operations.get("same-operation-key")?.requestHash, firstHash);
    assert.equal(operations.get("same-operation-key")?.propertyId, "prop_hash");
    assert.equal(operations.get("same-operation-key")?.attempts, 1, "conflicting retry did not mutate the operation");
  });

  it("serialises project rows and merges each status by id after slow work", async () => {
    const { createAgency, createClient, getClientForAgency, updateClient } = await import("../src/server/tenants");
    const { flushPendingWrites } = await import("../src/server/storage");
    const { withClientProjectTransaction } = await import("../src/server/productWorkspaceCoordinator");
    const agency = createAgency({ name: `Project lock ${Date.now()}` });
    const client = createClient(agency.id, {
      name: "Concurrent Projects",
      metadata: {
        properties: [
          { id: "prop_publish", repositoryStatus: "local" },
          { id: "prop_deploy", deploymentStatus: "not-deployed" },
        ],
      },
    });
    await flushPendingWrites();

    let firstEntered!: () => void;
    const entered = new Promise<void>(resolve => { firstEntered = resolve; });
    let releaseFirst!: () => void;
    const pause = new Promise<void>(resolve => { releaseFirst = resolve; });
    const change = async (propertyId: string, patch: Record<string, unknown>, wait = false) => (
      withClientProjectTransaction({ agencyId: agency.id, clientId: client.id }, async () => {
        if (wait) {
          firstEntered();
          await pause;
        }
        const fresh = getClientForAgency(agency.id, client.id);
        assert.ok(fresh);
        const properties = ((fresh.metadata?.properties ?? []) as Array<Record<string, unknown>>)
          .map(property => property.id === propertyId ? { ...property, ...patch } : property);
        assert.ok(updateClient(agency.id, client.id, { metadata: { properties } }));
      })
    );

    const publish = change("prop_publish", { repositoryStatus: "connected", repoUrl: "https://example.test/repo" }, true);
    await entered;
    const deploy = change("prop_deploy", { deploymentStatus: "preview", previewUrl: "https://example.test/preview" });
    releaseFirst();
    await Promise.all([publish, deploy]);

    const properties = (getClientForAgency(agency.id, client.id)?.metadata?.properties ?? []) as Array<Record<string, unknown>>;
    assert.equal(properties.find(property => property.id === "prop_publish")?.repositoryStatus, "connected");
    assert.equal(properties.find(property => property.id === "prop_publish")?.repoUrl, "https://example.test/repo");
    assert.equal(properties.find(property => property.id === "prop_deploy")?.deploymentStatus, "preview");
    assert.equal(properties.find(property => property.id === "prop_deploy")?.previewUrl, "https://example.test/preview");
    assert.equal(properties.length, 2, "neither concurrent status row was lost");
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
      assert.match(source, /withClientProjectTransaction\(\{ agencyId: session\.agencyId, clientId \}/, `${name} must use the shared per-client project lane`);
      assert.match(source, /resumableClientProjectOperation\(operationKey\)/, `${name} must consult the recorded operation`);
      assert.match(source, /await beginClientProjectOperation\(/, `${name} must record intent before acting`);
      assert.match(source, /requestHash,/, `${name} must bind the durable operation to its request`);
      assert.match(source, /await operation\.fail\(/, `${name} must record the failure, keeping its milestones`);
      assert.match(source, /await operation\.succeed\(\)/, `${name} must close the operation`);
      assert.ok(
        source.indexOf("await ensureHydrated({ fresh: true })") > source.indexOf(name === "provision" ? "provisionClientProject({" : name === "publish" ? "publishProjectToGitHub({" : "deployProjectPreviewToVercel({"),
        `${name} must reload durable client state after slow external work`,
      );
      assert.match(source, /freshProperties|existingProperties/, `${name} must merge from the reloaded property array`);
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
    assert.match(publish, /recoveryToken: operation\.operation\.recoveryToken/);
    assert.match(publish, /onRepositoryCreated: created => operation\.record\(/);
    assert.match(deploy, /adoptDeploymentId: resumable\?\.deploymentId/);
    assert.match(deploy, /reconcileKey: operation\.operation\.recoveryToken/);
    assert.match(deploy, /reconcileExisting: Boolean\(resumable\)/);
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

  it("refuses to reconcile an arbitrary colliding GitHub repository", async () => {
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
          size: 0,
          created_at: new Date().toISOString(),
          description: "Private client site",
        }), { status: 200 });
      }
      throw new Error(`unexpected GitHub call ${url}`);
    };

    await assert.rejects(publishProjectToGitHub({
      localPath,
      projectSlug: "collide-site",
      description: "Private client site",
      config: { token: "collide-token", owner: "edstorm987" },
      recoveryToken: "exact_operation_marker",
    }, {
      fetchImpl: fetchImpl as typeof fetch,
      runGit: (args: string[]) => {
        if (args.join(" ") === "remote get-url origin") throw new Error("no origin");
        return "";
      },
    }), /GitHub request failed \(422\)/);
    assert.equal(creates, 1);
    assert.equal(lookups, 1);
  });

  it("reconciles a repository whose create checkpoint failed before push", async () => {
    const { publishProjectToGitHub } = await import("../src/lib/server/integrations/githubProjectPublisher");
    const localPath = path.join(tempRoot, "checkpoint-publish-client", "checkpoint-site");
    mkdirSync(localPath, { recursive: true });
    let repository = {
      clone_url: "https://github.com/edstorm987/checkpoint-site.git",
      description: "Private client site",
      full_name: "edstorm987/checkpoint-site",
      html_url: "https://github.com/edstorm987/checkpoint-site",
      owner: { login: "edstorm987" },
      private: true,
    };
    let creates = 0;
    let lookups = 0;
    let restores = 0;
    let pushes = 0;
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/user")) return new Response(JSON.stringify({ login: "edstorm987" }), { status: 200 });
      if (url.endsWith("/user/repos")) {
        creates += 1;
        if (creates === 1) {
          repository = { ...repository, description: JSON.parse(String(init?.body)).description };
        }
        return creates === 1
          ? new Response(JSON.stringify(repository), { status: 201 })
          : new Response(JSON.stringify({ message: "name already exists on this account" }), { status: 422 });
      }
      if (url.endsWith("/repos/edstorm987/checkpoint-site")) {
        if (init?.method === "PATCH") {
          restores += 1;
          repository = { ...repository, description: JSON.parse(String(init.body)).description };
          return new Response(JSON.stringify(repository), { status: 200 });
        }
        lookups += 1;
        return new Response(JSON.stringify(repository), { status: 200 });
      }
      throw new Error(`unexpected GitHub call ${url}`);
    };
    const runGit = (args: string[]) => {
      if (args.join(" ") === "remote get-url origin") throw new Error("no origin");
      if (args[0] === "push") pushes += 1;
      return "";
    };
    const baseInput = {
      localPath,
      projectSlug: "checkpoint-site",
      description: "Private client site",
      config: { token: "checkpoint-token", owner: "edstorm987" },
      recoveryToken: "checkpoint_operation_marker",
    };

    await assert.rejects(publishProjectToGitHub({
      ...baseInput,
      onRepositoryCreated: async () => { throw new Error("checkpoint flush failed"); },
    }, { fetchImpl: fetchImpl as typeof fetch, runGit }), /checkpoint flush failed/);
    assert.equal(pushes, 0, "push waits for the durable repository checkpoint");
    assert.equal(restores, 0, "marker remains until the repository checkpoint is durable");
    assert.match(repository.description ?? "", /aqua-recovery:checkpoint_operation_marker/);

    const recovered = await publishProjectToGitHub({
      ...baseInput,
      onRepositoryCreated: async () => undefined,
    }, { fetchImpl: fetchImpl as typeof fetch, runGit });
    assert.equal(recovered.fullName, repository.full_name);
    assert.equal(creates, 2);
    assert.equal(lookups, 1);
    assert.equal(restores, 1);
    assert.equal(repository.description, "Private client site");
    assert.equal(pushes, 1);
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

  it("reconciles a deployment whose id checkpoint failed instead of creating a duplicate", async () => {
    const { deployProjectPreviewToVercel } = await import("../src/lib/server/integrations/vercelProjectDeployer");
    const localPath = path.join(tempRoot, "checkpoint-deploy-client", "checkpoint-deploy-site");
    mkdirSync(localPath, { recursive: true });
    writeFileSync(path.join(localPath, "index.html"), "<h1>Ready</h1>");
    const recoveryToken = "op_checkpoint_123";
    let creates = 0;
    let uploads = 0;
    let lists = 0;
    let deploymentMeta: Record<string, string> | undefined;
    const providerDeployment = {
      created: 1_700_000_000_000,
      uid: "dpl_checkpoint",
      name: "checkpoint-deploy-site",
      readyState: "QUEUED",
      url: "checkpoint-deploy-site.vercel.app",
    };
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/v6/deployments")) {
        lists += 1;
        return new Response(JSON.stringify({
          deployments: creates ? [{ ...providerDeployment, meta: deploymentMeta }] : [],
        }), { status: 200 });
      }
      if (url.includes("/v2/files")) {
        uploads += 1;
        return new Response("{}", { status: 200 });
      }
      if (url.includes("/v13/deployments") && init?.method === "POST") {
        creates += 1;
        deploymentMeta = JSON.parse(String(init.body)).meta;
        return new Response(JSON.stringify({ ...providerDeployment, id: providerDeployment.uid }), { status: 201 });
      }
      throw new Error(`unexpected Vercel call ${url}`);
    };
    const input = {
      localPath,
      projectSlug: "checkpoint-deploy-site",
      config: { token: "vercel-checkpoint-token", teamId: "team_checkpoint" },
      reconcileKey: recoveryToken,
    };

    // Vercel accepted the deployment, then the durable id checkpoint failed.
    await assert.rejects(deployProjectPreviewToVercel({
      ...input,
      onDeploymentCreated: async () => { throw new Error("checkpoint flush failed"); },
    }, { fetchImpl: fetchImpl as typeof fetch }), /checkpoint flush failed/);
    assert.equal(creates, 1);
    assert.equal(uploads, 1);
    assert.deepEqual(deploymentMeta, { aquaOperationId: recoveryToken });

    // The retry has no deployment id to adopt. Its stable metadata token finds
    // the provider object, so neither files nor a second deployment are sent.
    const recovered = await deployProjectPreviewToVercel({
      ...input,
      reconcileExisting: true,
    }, { fetchImpl: fetchImpl as typeof fetch });
    assert.equal(recovered.deploymentId, "dpl_checkpoint");
    assert.equal(recovered.previewUrl, "https://checkpoint-deploy-site.vercel.app");
    assert.equal(recovered.fileCount, 0);
    assert.equal(creates, 1);
    assert.equal(uploads, 1);
    assert.equal(lists, 1);
  });
});
