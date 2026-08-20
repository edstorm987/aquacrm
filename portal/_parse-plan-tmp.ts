import { readFileSync, readdirSync } from "node:fs";
import { parsePlanStatus } from "./src/lib/server/devTeamBoard";
const dir = "docs/development/plans";
for (const f of ["marketing-workspace-overhaul.md"]) {
  const md = readFileSync(`${dir}/${f}`, "utf8");
  console.log(f, JSON.stringify(parsePlanStatus(md)));
}
