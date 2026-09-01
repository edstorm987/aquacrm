import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  loadPortalEditorReads,
  type PortalEditorFetcher,
} from "../src/app/portal/agency/settings/portalEditorReads";

const editor = {
  agencyId: "agency-1",
  forms: {
    expenses: [{
      id: "field-po",
      label: "Purchase order",
      type: "text" as const,
      options: [],
      section: "Commercial",
      required: true,
      active: true,
      createdAt: 1,
      updatedAt: 1,
    }],
  },
  updatedAt: 1,
};

const contacts = [{
  id: "contact-role",
  label: "Role",
  type: "text" as const,
  options: [],
  formName: "Work",
}];

const categories = [{
  id: "category-software",
  name: "Software",
  isDefault: false,
  status: "active" as const,
}];

function response(payload: unknown, ok = true, status = ok ? 200 : 503) {
  return { ok, status, json: async () => payload };
}

function fetcher(overrides: Partial<Record<string, () => Promise<ReturnType<typeof response>>>> = {}): PortalEditorFetcher {
  const payloads: Record<string, unknown> = {
    "/api/portal/settings/portal-editor": { ok: true, editor },
    "/api/portal/leads-pipeline/contact-configuration": { ok: true, customFields: contacts },
    "/api/portal/agency-finance/categories": { ok: true, categories },
  };
  return (async input => {
    const url = String(input);
    if (overrides[url]) return overrides[url]!();
    return response(payloads[url]);
  }) as PortalEditorFetcher;
}

describe("Portal Editor configuration reads", () => {
  it("keeps three successful empty-or-populated reads distinguishable from failure", async () => {
    const reads = await loadPortalEditorReads(fetcher());

    assert.deepEqual(reads.editor, { available: true, data: editor });
    assert.deepEqual(reads.contacts, { available: true, data: contacts });
    assert.deepEqual(reads.categories, { available: true, data: categories });
  });

  it("preserves one rejected provider as unavailable without erasing sources that answered", async () => {
    const reads = await loadPortalEditorReads(fetcher({
      "/api/portal/leads-pipeline/contact-configuration": async () => { throw new Error("connection refused"); },
    }));

    assert.equal(reads.contacts.available, false);
    assert.deepEqual(reads.contacts.data, []);
    assert.match(reads.contacts.reason ?? "", /could not be read/i);
    assert.equal(reads.editor.available, true);
    assert.deepEqual(reads.editor.data, editor);
    assert.equal(reads.categories.available, true);
    assert.deepEqual(reads.categories.data, categories);
  });

  it("treats HTTP errors, malformed success and missing arrays as unavailable reads", async () => {
    const reads = await loadPortalEditorReads(fetcher({
      "/api/portal/settings/portal-editor": async () => response({ ok: false, error: "offline" }, false),
      "/api/portal/leads-pipeline/contact-configuration": async () => response({ ok: true }),
      "/api/portal/agency-finance/categories": async () => response({ ok: true, categories: null }),
    }));

    assert.equal(reads.editor.available, false);
    assert.equal(reads.contacts.available, false);
    assert.equal(reads.categories.available, false);
  });

  it("withholds empty claims and mutations until the corresponding read succeeds", () => {
    const source = readFileSync("src/app/portal/agency/settings/PortalEditorPanel.tsx", "utf8");

    assert.ok(!source.includes("void Promise.all(["), "the panel must use independent checked reads");
    assert.match(source, /canManage && !editing && fieldsAvailable && !loading/);
    assert.match(source, /fieldsUnavailable \? \(/);
    assert.match(source, /if \(!fieldsAvailable \|\| loading\) \{\s*setStatus\("These fields were not read/);
    assert.match(source, /available === false \? \(/);
    assert.match(source, /\{available \? \(\s*<div className="mt-3 divide-y/);
    assert.ok(source.includes("Retry read"));
    assert.ok(source.includes("Available settings were kept; unavailable sections are locked."));
  });
});
