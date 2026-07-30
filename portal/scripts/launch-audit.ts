import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { inspectProductionReadiness } from "../src/lib/server/productionReadiness";

function readEnvFile(path: string): NodeJS.ProcessEnv {
  if (!existsSync(path)) return {};
  const result: NodeJS.ProcessEnv = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!key) continue;
    const value = (rawValue ?? "").replace(/^(['"])(.*)\1$/, "$2");
    result[key] = value;
  }
  return result;
}

const local = readEnvFile(resolve(process.cwd(), ".env.local"));
const env = { ...local, ...process.env, VERCEL_ENV: process.env.VERCEL_ENV ?? "production" };
const result = inspectProductionReadiness(env);
const required = result.items.filter(item => item.required);
const optional = result.items.filter(item => !item.required);

console.log("\nMilesymedia production foundation\n");
for (const item of [...required, ...optional]) {
  const mark = item.status === "ready" ? "READY" : item.required ? "BLOCKED" : "OPTIONAL";
  console.log(`${mark.padEnd(8)} ${item.label}`);
  if (item.status !== "ready") console.log(`         ${item.action}`);
}
console.log(`\nRequired services: ${required.filter(item => item.status === "ready").length}/${required.length} ready`);
console.log(result.ready ? "Launch foundation is ready.\n" : "Launch foundation is not ready yet. No secret values were printed.\n");

process.exitCode = result.ready ? 0 : 1;
