import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("private uploads use one durable storage boundary", () => {
  const storage = read("src/lib/server/privateUploadStorage.ts");
  assert.match(storage, /access: "private"/);
  assert.match(storage, /durablePrivateUploadsRequired/);
  assert.match(storage, /NODE_ENV === "production"/);
  assert.match(storage, /PrivateUploadStorageError/);
  assert.match(storage, /\.data/);
});

test("every business upload route fails closed through the shared boundary", () => {
  for (const route of [
    "src/app/api/tenants/client-files/upload/route.ts",
    "src/app/api/portal/finance/expense-attachments/upload/route.ts",
    "src/app/api/portal/company/legal/upload/route.ts",
    "src/app/api/portal/sops/upload/route.ts",
    "src/app/api/portal/development/upload/route.ts",
    "src/app/api/portal/freelancer/work/route.ts",
  ]) {
    const source = read(route);
    assert.match(source, /storePrivateUpload/);
    assert.match(source, /PrivateUploadStorageError/);
    assert.match(source, /status: 503/);
    assert.doesNotMatch(source, /from "@vercel\/blob"/);
  }
});
