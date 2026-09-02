import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { before, beforeEach, describe, it } from "node:test";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

type StorageModule = typeof import("../src/server/storage");
type PortalEditorModule = typeof import("../src/server/portalEditor");
type TenantsModule = typeof import("../src/server/tenants");
type TasksModule = typeof import("../src/server/tasks");
type ProductsModule = typeof import("../src/server/agencyProducts");
type LeadHandlersModule = typeof import("../src/built-ins/modules/leads-pipeline/src/api/handlers");

let storage: StorageModule;
let portalEditor: PortalEditorModule;
let tenants: TenantsModule;
let tasks: TasksModule;
let products: ProductsModule;
let leadHandlers: LeadHandlersModule;
let validatePortalFormValues: typeof import("../src/lib/forms/portalFormValues").validatePortalFormValues;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  process.env.NODE_ENV = "test";
  storage = await import("../src/server/storage");
  portalEditor = await import("../src/server/portalEditor");
  tenants = await import("../src/server/tenants");
  tasks = await import("../src/server/tasks");
  products = await import("../src/server/agencyProducts");
  const foundation = await import("../src/built-ins/modules/leads-pipeline/src/server/foundationAdapter");
  foundation.registerLeadsPipelineFoundation({
    tenant: { getAgency: id => tenants.getAgency(id) as never },
    activity: {
      logActivity: input => ({ id: `activity-${Date.now()}`, ts: Date.now(), ...input }),
      listActivity: () => [],
    },
    events: { emit: () => undefined },
    pluginInstalls: { getInstall: () => null },
  });
  leadHandlers = await import("../src/built-ins/modules/leads-pipeline/src/api/handlers");
  ({ validatePortalFormValues } = await import("../src/lib/forms/portalFormValues"));
  await storage.ensureHydrated();
});

beforeEach(async () => {
  await storage.reset();
});

describe("Portal Editor value authority", () => {
  const fields = [
    field("text", "text"),
    field("long", "textarea"),
    field("amount", "number"),
    field("day", "date"),
    field("site", "url"),
    field("mail", "email"),
    field("choice", "select", ["One", "Two"]),
    field("many", "multi-select", ["Red", "Blue"]),
    field("accepted", "checkbox", [], true),
  ];

  it("normalises every supported type and rejects values outside the schema", () => {
    const result = validatePortalFormValues({
      fields,
      values: {
        text: "  hello  ",
        long: "Details",
        amount: 12.5,
        day: "2026-08-25",
        site: "https://example.test/path",
        mail: "owner@example.test",
        choice: "One",
        many: ["Red", "Red", "Blue"],
        accepted: true,
      },
    });
    assert.equal(result.text, "hello");
    assert.equal(result.amount, "12.5");
    assert.equal(result.site, "https://example.test/path");
    assert.deepEqual(result.many, ["Red", "Blue"]);

    assert.throws(() => validatePortalFormValues({ fields, values: { choice: "Three", accepted: true } }), /available options/i);
    assert.throws(() => validatePortalFormValues({ fields, values: { day: "2026-02-30", accepted: true } }), /valid date/i);
    assert.throws(() => validatePortalFormValues({ fields, values: { site: "javascript:alert(1)", accepted: true } }), /http or https/i);
    assert.throws(() => validatePortalFormValues({ fields, values: { mail: "not-an-email", accepted: true } }), /email address/i);
    assert.throws(() => validatePortalFormValues({ fields, values: { unknown: "value", accepted: true } }), /not defined/i);
    assert.throws(() => validatePortalFormValues({ fields, values: { accepted: false } }), /required/i);
  });

  it("preserves historical values after definition removal without accepting new writes to them", () => {
    const historical = validatePortalFormValues({ fields: [], existing: { retired: "kept" } });
    assert.deepEqual(historical, { retired: "kept" });
    assert.deepEqual(validatePortalFormValues({ fields: [], existing: historical, values: { retired: "kept" } }), historical);
    assert.throws(() => validatePortalFormValues({ fields: [], existing: historical, values: { retired: "changed" } }), /not defined/i);
    assert.throws(() => validatePortalFormValues({ fields: [{ ...field("old", "text"), active: false }], values: { old: "changed" } }), /no longer active/i);
  });
});

describe("canonical record writers consume the configured schema", () => {
  it("validates and retains Client, Action and Product custom values", () => {
    const agency = tenants.createAgency({ name: "Form authority", slug: "form-authority" });
    for (const entity of ["clients", "tasks", "products"] as const) {
      portalEditor.savePortalEditorField(agency.id, entity, {
        id: "account-tier",
        label: "Account tier",
        type: "select",
        options: ["Core", "Priority"],
        required: true,
      }, "owner");
    }

    assert.throws(() => tenants.createClient(agency.id, { name: "Missing tier", metadata: { customFields: {} } }), /required/i);
    const client = tenants.createClient(agency.id, { name: "Priority client", metadata: { customFields: { "account-tier": "Priority" } } });
    assert.deepEqual(client.metadata?.customFields, { "account-tier": "Priority" });

    assert.throws(() => tasks.createAgencyTask({ agencyId: agency.id, title: "Missing tier", createdBy: "owner", customFields: {} }), /required/i);
    const task = tasks.createAgencyTask({ agencyId: agency.id, title: "Scoped action", createdBy: "owner", customFields: { "account-tier": "Core" } });
    assert.deepEqual(task.customFields, { "account-tier": "Core" });

    assert.throws(() => products.createAgencyProduct(agency.id, { name: "Bad product", customFields: { "account-tier": "Unknown" } }, "owner"), /available options/i);
    const product = products.createAgencyProduct(agency.id, { name: "Priority service", customFields: { "account-tier": "Priority" } }, "owner");
    assert.deepEqual(product.customFields, { "account-tier": "Priority" });

    portalEditor.deletePortalEditorField(agency.id, "tasks", "account-tier", "owner");
    assert.deepEqual(portalEditor.getPortalFormFields(agency.id, "tasks"), []);
    const renamed = tasks.updateAgencyTask(agency.id, task.id, { title: "Renamed action" }, "owner");
    assert.deepEqual(renamed?.customFields, { "account-tier": "Core" });
    assert.throws(() => tasks.updateAgencyTask(agency.id, task.id, { customFields: { "account-tier": "Priority" } }, "owner"), /not defined/i);

    portalEditor.deletePortalEditorField(agency.id, "clients", "account-tier", "owner");
    assert.deepEqual(portalEditor.getPortalFormFields(agency.id, "clients"), []);
    const renamedClient = tenants.updateClient(agency.id, client.id, { name: "Priority client renamed" });
    assert.deepEqual(renamedClient?.metadata?.customFields, { "account-tier": "Priority" });
    assert.throws(() => tenants.updateClient(agency.id, client.id, { metadata: { customFields: { "account-tier": "Core" } } }), /not defined/i);

    portalEditor.deletePortalEditorField(agency.id, "products", "account-tier", "owner");
    assert.deepEqual(portalEditor.getPortalFormFields(agency.id, "products"), []);
    const renamedProduct = products.updateAgencyProduct(agency.id, product.id, { name: "Priority service renamed" }, "owner");
    assert.deepEqual(renamedProduct?.customFields, { "account-tier": "Priority" });
    assert.throws(() => products.updateAgencyProduct(agency.id, product.id, { customFields: { "account-tier": "Core" } }, "owner"), /not defined/i);
  });

  it("validates Expense writes against the same server schema", async () => {
    const { ExpenseService } = await import("../src/built-ins/modules/agency-finance/src/server/expenses");
    const { CategoryService } = await import("../src/built-ins/modules/agency-finance/src/server/categories");
    const { BudgetService } = await import("../src/built-ins/modules/agency-finance/src/server/budgets");
    const agency = tenants.createAgency({ name: "Expense authority", slug: "expense-authority" });
    portalEditor.savePortalEditorField(agency.id, "expenses", { id: "receipt-kind", label: "Receipt kind", type: "select", options: ["Digital", "Paper"], required: true }, "owner");

    const rows = new Map<string, unknown>();
    const pluginStorage = {
      async get<T>(key: string) { return rows.get(key) as T | undefined; },
      async set<T>(key: string, value: T) { rows.set(key, value); },
      async del(key: string) { rows.delete(key); },
      async list(prefix = "") { return [...rows.keys()].filter(key => key.startsWith(prefix)); },
    };
    const activity = { logActivity: () => ({}) as never, listActivity: () => [] };
    const events = { emit: () => undefined };
    const categories = new CategoryService(agency.id, pluginStorage, activity, events);
    const budgets = new BudgetService(agency.id, pluginStorage, activity, events);
    const expenses = new ExpenseService(agency.id, pluginStorage, activity, events, categories, budgets);
    const category = await categories.create({ name: "Travel" }, "owner");

    await assert.rejects(expenses.create({ categoryId: category.id, amountCents: 1_000, customFields: {} }, "owner"), /required/i);
    const expense = await expenses.create({ categoryId: category.id, amountCents: 1_000, customFields: { "receipt-kind": "Digital" } }, "owner");
    assert.deepEqual(expense.customFields, { "receipt-kind": "Digital" });
    portalEditor.deletePortalEditorField(agency.id, "expenses", "receipt-kind", "owner");
    assert.deepEqual(portalEditor.getPortalFormFields(agency.id, "expenses"), []);
    const updated = await expenses.update(expense.id, { amountCents: 1_200 }, "owner");
    assert.deepEqual(updated?.customFields, { "receipt-kind": "Digital" });
    await assert.rejects(expenses.update(expense.id, { customFields: { "receipt-kind": "Paper" } }, "owner"), /not defined/i);
  });

  it("enforces the Lead and delegated Contact schemas through their real API handlers", async () => {
    const agency = tenants.createAgency({ name: "Handler authority", slug: "handler-authority" });
    const ctx = pluginContext(agency.id);

    portalEditor.savePortalEditorField(agency.id, "leads", {
      id: "lead-fit",
      label: "Lead fit",
      type: "select",
      options: ["Good", "Poor"],
      required: true,
    }, "owner");
    const missingLead = await leadHandlers.createLeadHandler(jsonRequest("POST", {
      email: "missing@example.test",
      source: "manual",
      customFields: {},
    }), ctx as never);
    assert.equal(missingLead.status, 422);
    const createdLead = await leadHandlers.createLeadHandler(jsonRequest("POST", {
      email: "lead@example.test",
      source: "manual",
      customFields: { "lead-fit": "Good" },
    }), ctx as never);
    assert.equal(createdLead.status, 201);
    const leadBody = await createdLead.json() as { lead: { id: string; customFields: Record<string, unknown> } };
    assert.equal(leadBody.lead.customFields["lead-fit"], "Good");
    const invalidLeadEdit = await leadHandlers.updateLeadHandler(jsonRequest("PATCH", {
      customFields: { "lead-fit": "Unknown" },
    }, `?id=${leadBody.lead.id}`), ctx as never);
    assert.equal(invalidLeadEdit.status, 422);
    portalEditor.deletePortalEditorField(agency.id, "leads", "lead-fit", "owner");
    assert.deepEqual(portalEditor.getPortalFormFields(agency.id, "leads"), []);
    const historicalLeadEdit = await leadHandlers.updateLeadHandler(jsonRequest("PATCH", {
      notes: "Definition archived",
    }, `?id=${leadBody.lead.id}`), ctx as never);
    assert.equal(historicalLeadEdit.status, 200);

    const savedDefinition = await leadHandlers.contactConfigurationHandler(jsonRequest("POST", {
      action: "save-field",
      field: {
        id: "contact-kind",
        label: "Contact kind",
        type: "select",
        options: ["Partner", "Supplier"],
        formName: "Relationship",
        required: true,
      },
    }), ctx as never);
    assert.equal(savedDefinition.status, 200);
    const missingContact = await leadHandlers.createContactHandler(jsonRequest("POST", {
      email: "missing-contact@example.test",
      type: "other",
      source: "manual",
      customFields: {},
    }), ctx as never);
    assert.equal(missingContact.status, 422);
    const createdContact = await leadHandlers.createContactHandler(jsonRequest("POST", {
      email: "contact@example.test",
      type: "other",
      source: "manual",
      customFields: { "contact-kind": "Partner" },
    }), ctx as never);
    assert.equal(createdContact.status, 201);
    const contactBody = await createdContact.json() as { contact: { id: string; customFields: Record<string, unknown> } };
    assert.equal(contactBody.contact.customFields["contact-kind"], "Partner");
    const invalidContactEdit = await leadHandlers.updateContactHandler(jsonRequest("PATCH", {
      customFields: { "contact-kind": "Unknown" },
    }, `?id=${contactBody.contact.id}`), ctx as never);
    assert.equal(invalidContactEdit.status, 422);
    const deletedDefinition = await leadHandlers.contactConfigurationHandler(jsonRequest("POST", {
      action: "delete-field",
      fieldId: "contact-kind",
    }), ctx as never);
    assert.equal(deletedDefinition.status, 200);
    const reloadedDefinitions = await leadHandlers.contactConfigurationHandler(new Request("http://portal.test/contact-configuration"), ctx as never);
    assert.deepEqual((await reloadedDefinitions.json() as { customFields: unknown[] }).customFields, []);
    const historicalContactEdit = await leadHandlers.updateContactHandler(jsonRequest("PATCH", {
      notes: "Definition archived",
    }, `?id=${contactBody.contact.id}`), ctx as never);
    assert.equal(historicalContactEdit.status, 200);
  });
});

describe("all six advertised forms have mounted consumers and guarded writers", () => {
  it("keeps Contacts on one explicitly delegated schema", () => {
    assert.throws(() => portalEditor.savePortalEditorField("agency", "contacts", {
      id: "split-brain",
      label: "Split brain",
      type: "text",
    }, "owner"), /Leads Pipeline contact configuration/i);
  });

  it("keeps the schema renderer on the Client, Lead, Action, Product and Expense forms", () => {
    for (const path of [
      "src/app/portal/agency/_NewClientButton.tsx",
      "src/app/portal/clients/[clientId]/settings/_ClientCustomFieldsSettings.tsx",
      "src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx",
      "src/app/portal/agency/actions/_ActionsWorkspace.tsx",
      "src/app/portal/agency/products/_ProductsWorkspace.tsx",
      "src/built-ins/modules/agency-finance/src/components/ExpensesList.tsx",
    ]) {
      assert.match(readFileSync(path, "utf8"), /PortalCustomFields|CustomFieldInput/, `${path} lost its custom-field consumer`);
    }
    const contacts = readFileSync("src/app/portal/agency/leads-pipeline/contacts/_ContactsWorkspace.tsx", "utf8");
    assert.match(contacts, /customFieldDefinitions\.map/);
    assert.match(contacts, /CustomFieldInput/);

    const editor = readFileSync("src/app/portal/agency/settings/PortalEditorPanel.tsx", "utf8");
    assert.match(editor, /entity === "contacts"/);
    assert.match(editor, /contact-configuration/);
    const contactsPage = readFileSync("src/built-ins/modules/leads-pipeline/src/pages/ContactsPage.tsx", "utf8");
    assert.match(contactsPage, /contacts\/custom-field-definitions/);
  });

  it("keeps validation at each canonical write boundary", () => {
    for (const path of [
      "src/server/tenants.ts",
      "src/server/tasks.ts",
      "src/server/agencyProducts.ts",
      "src/built-ins/modules/agency-finance/src/server/expenses.ts",
      "src/built-ins/modules/leads-pipeline/src/api/handlers.ts",
    ]) {
      assert.match(readFileSync(path, "utf8"), /validatePortal(EntityFields|FormValues)|validateContactCustomFields/, `${path} lost server validation`);
    }
    assert.match(readFileSync("src/app/api/tenants/client-custom-fields/route.ts", "utf8"), /updateClient/);
    assert.match(readFileSync("src/built-ins/modules/leads-pipeline/src/api/handlers.ts", "utf8"), /validatePortalEntityFields\(ctx\.agencyId, "leads"/);
  });
});

function field(id: string, type: import("../src/server/types").PortalFormFieldType, options: string[] = [], required = false): import("../src/server/types").PortalFormFieldDefinition {
  return { id, label: id, type, options, section: "Extra details", required, active: true, createdAt: 1, updatedAt: 1 };
}

function jsonRequest(method: string, body: unknown, search = ""): Request {
  return new Request(`http://portal.test/records${search}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function pluginContext(agencyId: string) {
  const rows = new Map<string, unknown>();
  const exclusiveQueues = new Map<string, Promise<void>>();
  return {
    agencyId,
    actor: "owner",
    install: {
      id: `install-${agencyId}`,
      pluginId: "@aqua/plugin-leads-pipeline",
      agencyId,
      enabled: true,
      config: {},
      features: {},
      installedAt: 1,
    },
    storage: {
      async get<T>(key: string) { return rows.get(key) as T | undefined; },
      async set<T>(key: string, value: T) { rows.set(key, value); },
      async setIfAbsent<T>(key: string, value: T) {
        if (rows.has(key)) return false;
        rows.set(key, value);
        return true;
      },
      async del(key: string) { rows.delete(key); },
      async list(prefix = "") { return [...rows.keys()].filter(key => key.startsWith(prefix)); },
      async runExclusive<T>(key: string, work: () => Promise<T>) {
        const previous = exclusiveQueues.get(key) ?? Promise.resolve();
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const queued = previous.then(() => gate);
        exclusiveQueues.set(key, queued);
        await previous;
        try {
          return await work();
        } finally {
          release();
          if (exclusiveQueues.get(key) === queued) exclusiveQueues.delete(key);
        }
      },
    },
    services: {},
  };
}
