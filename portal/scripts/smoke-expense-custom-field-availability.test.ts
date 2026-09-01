import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { readExpenseCustomFields } from "../src/built-ins/modules/agency-finance/src/components/expenseCustomFieldRead";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const component = readFileSync(join(
  ROOT,
  "src/built-ins/modules/agency-finance/src/components/ExpensesList.tsx",
), "utf8");

const field = {
  id: "purchase-order",
  label: "Purchase order",
  type: "text" as const,
  options: [],
  section: "Approval",
  required: true,
  active: true,
};

function response(input: { ok?: boolean; status?: number; payload?: unknown; reject?: boolean }) {
  return async () => {
    if (input.reject) throw new Error("network refused");
    return {
      ok: input.ok ?? true,
      status: input.status ?? 200,
      json: async () => input.payload,
    };
  };
}

describe("the expense editor reads its Portal Editor schema truthfully", () => {
  it("returns a confirmed configured schema", async () => {
    const read = await readExpenseCustomFields(response({
      payload: { ok: true, editor: { forms: { expenses: [field] } } },
    }));
    assert.deepEqual(read, { available: true, data: [field] });
  });

  it("treats a confirmed absent expense schema as empty, not unavailable", async () => {
    const read = await readExpenseCustomFields(response({
      payload: { ok: true, editor: { forms: {} } },
    }));
    assert.deepEqual(read, { available: true, data: [] });
  });

  it("preserves network, HTTP and malformed failures as unavailable", async () => {
    const rejected = await readExpenseCustomFields(response({ reject: true }));
    const http = await readExpenseCustomFields(response({ ok: false, status: 503, payload: { ok: false } }));
    const malformed = await readExpenseCustomFields(response({
      payload: { ok: true, editor: { forms: { expenses: "not-an-array" } } },
    }));
    const malformedField = await readExpenseCustomFields(response({
      payload: { ok: true, editor: { forms: { expenses: [{ id: "broken", active: true }] } } },
    }));

    for (const read of [rejected, http, malformed, malformedField]) {
      assert.equal(read.available, false);
      assert.deepEqual(read.data, []);
      assert.match(read.reason ?? "", /Retry before adding, editing or exporting/i);
    }
  });
});

describe("the mounted expense surface locks consequential operations", () => {
  it("adopts only confirmed schemas, exposes retry and retains the last snapshot", () => {
    assert.match(component, /if \(next\.available\) setCustomFields\(next\.data\)/);
    assert.match(component, /Retry form fields/);
    assert.match(component, /last confirmed fields remain visible/i);
  });

  it("locks Add, Edit and Export until the schema read succeeds", () => {
    assert.match(component, /disabled=\{!customFieldsAvailable\} onClick=\{downloadCsv\}/);
    assert.match(component, /disabled=\{!customFieldsAvailable\} onClick=\{\(\) => setAdding/);
    assert.match(component, /onEdit=\{canMutate && customFieldsAvailable/);
    assert.match(component, /Not read — retry from the Expenses sheet/);
  });
});
