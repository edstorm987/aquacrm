import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Vercel Git Integration currently finalizes subdirectory Next.js projects
// from the repository root. Mirror the deterministic manifest there so the
// finalizer can package the already-successful build output.
if (process.env.VERCEL === "1") {
  const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const sourcePath = join(projectDir, ".next", "routes-manifest.json");
  const targetPath = join(projectDir, "..", ".next", "routes-manifest-deterministic.json");
  const manifest = JSON.parse(await readFile(sourcePath, "utf8"));

  manifest.headers = [];
  manifest.onMatchHeaders = [];
  delete manifest.deploymentId;

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, JSON.stringify(manifest));
  console.log("Prepared Vercel root routes manifest.");
}
