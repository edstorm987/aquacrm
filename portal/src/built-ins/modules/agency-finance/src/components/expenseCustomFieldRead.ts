import { readOrUnavailable, type ReadResult } from "@/lib/readAvailability";

export interface ExpenseCustomFieldDefinition {
  id: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "url" | "email" | "select" | "multi-select" | "checkbox";
  options: string[];
  section: string;
  required: boolean;
  active: boolean;
}

export type ExpenseCustomFieldFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "json">>;

const EXPENSE_FIELD_TYPES = new Set<ExpenseCustomFieldDefinition["type"]>([
  "text",
  "textarea",
  "number",
  "date",
  "url",
  "email",
  "select",
  "multi-select",
  "checkbox",
]);

function isExpenseCustomFieldDefinition(value: unknown): value is ExpenseCustomFieldDefinition {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const field = value as Record<string, unknown>;
  return typeof field.id === "string"
    && typeof field.label === "string"
    && EXPENSE_FIELD_TYPES.has(field.type as ExpenseCustomFieldDefinition["type"])
    && Array.isArray(field.options)
    && field.options.every(option => typeof option === "string")
    && typeof field.section === "string"
    && typeof field.required === "boolean"
    && typeof field.active === "boolean";
}

/**
 * Read the Portal Editor schema used by the mounted expense form.
 *
 * `forms.expenses` being absent is a confirmed empty schema. A rejected,
 * non-2xx or malformed response is unavailable and must lock Add/Edit/Export
 * rather than making required custom inputs disappear from those operations.
 */
export async function readExpenseCustomFields(
  fetcher: ExpenseCustomFieldFetcher = fetch,
): Promise<ReadResult<ExpenseCustomFieldDefinition[]>> {
  return readOrUnavailable(async () => {
    const response = await fetcher("/api/portal/settings/portal-editor", { cache: "no-store" });
    const payload = await response.json() as unknown;
    if (!response.ok || !payload || typeof payload !== "object") {
      throw new Error(`Expense form settings failed with HTTP ${response.status}.`);
    }
    const record = payload as Record<string, unknown>;
    if (record.ok !== true || !record.editor || typeof record.editor !== "object") {
      throw new Error("Expense form settings were missing.");
    }
    const forms = (record.editor as Record<string, unknown>).forms;
    if (!forms || typeof forms !== "object" || Array.isArray(forms)) {
      throw new Error("Expense form definitions were missing.");
    }
    const expenseFields = (forms as Record<string, unknown>).expenses;
    if (expenseFields !== undefined && !Array.isArray(expenseFields)) {
      throw new Error("Expense form definitions were malformed.");
    }
    if (Array.isArray(expenseFields) && !expenseFields.every(isExpenseCustomFieldDefinition)) {
      throw new Error("Expense form definitions contained a malformed field.");
    }
    return (expenseFields ?? []).filter(field => field.active);
  }, [], "Expense form fields could not be read. Retry before adding, editing or exporting expenses.");
}
