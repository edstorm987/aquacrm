import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  CheckedMutationError,
  checkedJsonMutation,
} from "../src/lib/client/checkedMutation";
import {
  isFinanceMutationAck,
  isFinanceMutationEntities,
  isFinanceMutationEntity,
  isFinanceMutationHttpsUrl,
} from "../src/built-ins/modules/agency-finance/src/lib/mutationPayloads";

const FINANCE_MUTATION_COMPONENTS = [
  "src/built-ins/modules/agency-finance/src/components/BudgetPotsWorkspace.tsx",
  "src/built-ins/modules/agency-finance/src/components/CanonicalCompensationModals.tsx",
  "src/built-ins/modules/agency-finance/src/components/CommercialPlansManager.tsx",
  "src/built-ins/modules/agency-finance/src/components/ExpensesList.tsx",
  "src/built-ins/modules/agency-finance/src/components/FinanceOperationsWorkspace.tsx",
  "src/built-ins/modules/agency-finance/src/components/IncomeSheet.tsx",
  "src/built-ins/modules/agency-finance/src/components/InvoiceDetailClient.tsx",
  "src/built-ins/modules/agency-finance/src/components/InvoicesList.tsx",
  "src/built-ins/modules/agency-finance/src/components/InvoiceTemplateEditor.tsx",
  "src/built-ins/modules/agency-finance/src/components/NewPlanForm.tsx",
] as const;

function source(file: string): string {
  return readFileSync(join(process.cwd(), file), "utf8");
}

function response(body: string, status = 200): typeof fetch {
  return async () => new Response(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Agency Finance checked mutation boundary", () => {
  it("rejects truthy but malformed Finance success shapes", async () => {
    assert.equal(isFinanceMutationAck({ ok: true }), true);
    assert.equal(isFinanceMutationAck([Object.assign({ ok: true })]), false);

    for (const plan of ["saved", [], {}, { id: "" }]) {
      assert.equal(isFinanceMutationEntity({ ok: true, plan }, "plan"), false);
    }
    assert.equal(isFinanceMutationEntity({ ok: true, plan: { id: "plan_1" } }, "plan"), true);
    assert.equal(isFinanceMutationEntities({
      ok: true,
      expense: { id: "expense_1" },
      source: "truthy-but-not-a-record",
    }, ["expense", "source"]), false);
    assert.equal(isFinanceMutationHttpsUrl({ ok: true, url: "javascript:alert(1)" }), false);
    assert.equal(isFinanceMutationHttpsUrl({ ok: true, url: "http://checkout.example.test" }), false);
    assert.equal(isFinanceMutationHttpsUrl({ ok: true, url: "https://checkout.example.test" }), true);

    let continued = false;
    await assert.rejects(
      checkedJsonMutation<{ ok: boolean; plan?: unknown }>("/api/portal/agency-finance/plans/update", { method: "PATCH" }, {
        fallback: "Plan could not be updated.",
        fetcher: response(JSON.stringify({ ok: true, plan: "saved" })),
        validate: payload => isFinanceMutationEntity(payload, "plan"),
      }).then(() => { continued = true; }),
      (error: unknown) => error instanceof CheckedMutationError && error.kind === "domain",
    );
    assert.equal(continued, false);
  });

  it("keeps every mounted Finance mutation control off raw fetch", () => {
    for (const file of FINANCE_MUTATION_COMPONENTS) {
      const component = source(file);
      assert.match(component, /checkedJsonMutation/, `${file} must use the checked mutation boundary`);
      assert.doesNotMatch(component, /\bfetch\s*\(/, `${file} must not bypass checked mutation handling`);
    }
  });

  it("keeps recurring posting and invoice issue-now on the checked boundary", () => {
    const expenses = source("src/built-ins/modules/agency-finance/src/components/ExpensesList.tsx");
    const recurringStart = expenses.indexOf("async function postNextExpense");
    const recurringEnd = expenses.indexOf("\n  function downloadCsv", recurringStart);
    assert.ok(recurringStart >= 0 && recurringEnd > recurringStart);
    const recurring = expenses.slice(recurringStart, recurringEnd);
    assert.match(recurring, /checkedJsonMutation/);
    assert.match(recurring, /mutationErrorMessage/);
    assert.match(recurring, /finally/);

    const invoices = source("src/built-ins/modules/agency-finance/src/components/InvoicesList.tsx");
    const issueNowStart = invoices.indexOf("function NewInvoiceForm");
    const issueNowEnd = invoices.indexOf("\nfunction MarkPaidButton", issueNowStart);
    assert.ok(issueNowStart >= 0 && issueNowEnd > issueNowStart);
    const issueNow = invoices.slice(issueNowStart, issueNowEnd);
    assert.match(issueNow, /issueNow/);
    assert.ok(
      [...issueNow.matchAll(/checkedJsonMutation/g)].length >= 2,
      "invoice creation and its issue-now follow-up must both reject false success",
    );
    assert.match(issueNow, /finally/);
  });

  it("rejects transport failure without allowing a Finance success continuation", async () => {
    let continued = false;
    await assert.rejects(
      checkedJsonMutation<{ ok: boolean }>("/api/portal/agency-finance/payments/create", { method: "POST" }, {
        fallback: "Income could not be recorded.",
        fetcher: async () => { throw new TypeError("network detail"); },
        validate: payload => payload.ok === true,
      }).then(() => { continued = true; }),
      (error: unknown) => error instanceof CheckedMutationError
        && error.kind === "transport"
        && error.message === "Income could not be recorded. Check your connection and try again.",
    );
    assert.equal(continued, false);
  });

  it("rejects malformed JSON without allowing a Finance success continuation", async () => {
    let continued = false;
    await assert.rejects(
      checkedJsonMutation<{ ok: boolean }>("/api/portal/agency-finance/income", { method: "POST" }, {
        fallback: "Income could not be added.",
        fetcher: response("not-json"),
        validate: payload => payload.ok === true,
      }).then(() => { continued = true; }),
      (error: unknown) => error instanceof CheckedMutationError
        && error.kind === "response"
        && /unreadable response/i.test(error.message),
    );
    assert.equal(continued, false);
  });

  it("rejects non-2xx and preserves an actionable Finance refusal", async () => {
    let continued = false;
    await assert.rejects(
      checkedJsonMutation<{ ok: boolean }>("/api/portal/agency-finance/plans/update", { method: "PATCH" }, {
        fallback: "Plan could not be updated.",
        fetcher: response(JSON.stringify({ ok: false, error: "That plan changed. Reload and try again." }), 409),
        validate: payload => payload.ok === true,
      }).then(() => { continued = true; }),
      (error: unknown) => error instanceof CheckedMutationError
        && error.kind === "http"
        && error.status === 409
        && error.message === "That plan changed. Reload and try again.",
    );
    assert.equal(continued, false);
  });

  it("rejects a 2xx domain refusal without posting a recurring expense", async () => {
    let continued = false;
    await assert.rejects(
      checkedJsonMutation<{ ok: boolean }>("/api/portal/agency-finance/expenses/post-recurring", { method: "POST" }, {
        fallback: "Could not post the next expense.",
        fetcher: response(JSON.stringify({ ok: false, error: "That occurrence was already posted." })),
        validate: payload => payload.ok === true,
      }).then(() => { continued = true; }),
      (error: unknown) => error instanceof CheckedMutationError
        && error.kind === "domain"
        && error.message === "That occurrence was already posted.",
    );
    assert.equal(continued, false);
  });
});
