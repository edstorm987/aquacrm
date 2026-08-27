import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("local dev mode can mint real existing non-owner persona sessions", async () => {
  const source = await readFile("src/app/dev/route.ts", "utf8");
  assert.match(source, /staff:\s*["']agency-staff["']/);
  assert.match(source, /freelancer:\s*["']freelancer["']/);
  assert.match(source, /listUsersForAgency\(agency\.id\)\.find\(user => user\.role === requestedRole\)/);
  assert.match(source, /userId:\s*selectedUser\.id/);
  assert.match(source, /sessionRev:\s*selectedUser\.sessionRev/);
  assert.doesNotMatch(source, /createUser\([\s\S]{0,300}role:\s*requestedRole/);
});
