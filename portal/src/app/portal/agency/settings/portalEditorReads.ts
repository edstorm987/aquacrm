import {
  readOrUnavailable,
  type ReadResult,
} from "@/lib/readAvailability";
import type { PortalFormEditorState } from "@/server/types";

export type ContactField = {
  id: string;
  label: string;
  type: "text" | "number" | "date" | "url" | "select" | "multi-select" | "checkbox";
  options: string[];
  formName: string;
  required?: boolean;
};

export type ExpenseCategory = {
  id: string;
  name: string;
  description?: string;
  isDefault: boolean;
  status: "active" | "archived";
};

export interface PortalEditorReads {
  editor: ReadResult<PortalFormEditorState | null>;
  contacts: ReadResult<ContactField[]>;
  categories: ReadResult<ExpenseCategory[]>;
}

export type PortalEditorFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "json">>;

async function checkedPayload(
  fetcher: PortalEditorFetcher,
  url: string,
): Promise<Record<string, unknown>> {
  const response = await fetcher(url, { cache: "no-store" });
  const payload = await response.json() as unknown;
  if (!response.ok || !payload || typeof payload !== "object" || !("ok" in payload) || payload.ok !== true) {
    throw new Error(`Configuration read failed with HTTP ${response.status}.`);
  }
  return payload as Record<string, unknown>;
}

/**
 * Read each Portal Editor source independently.
 *
 * These endpoints do not share a transaction or availability boundary. One
 * provider refusing a read must not erase two sources that did answer, and an
 * empty fallback must never be presented as a measured empty configuration.
 */
export async function loadPortalEditorReads(
  fetcher: PortalEditorFetcher = fetch,
): Promise<PortalEditorReads> {
  const [editor, contacts, categories] = await Promise.all([
    readOrUnavailable(async () => {
      const payload = await checkedPayload(fetcher, "/api/portal/settings/portal-editor");
      if (!payload.editor || typeof payload.editor !== "object") throw new Error("Portal form settings were missing.");
      return payload.editor as PortalFormEditorState;
    }, null, "Custom form fields could not be read. Retry before changing this form."),
    readOrUnavailable(async () => {
      const payload = await checkedPayload(fetcher, "/api/portal/leads-pipeline/contact-configuration");
      if (!Array.isArray(payload.customFields)) throw new Error("Contact field settings were missing.");
      return payload.customFields as ContactField[];
    }, [], "Contact fields could not be read. Retry before changing this form."),
    readOrUnavailable(async () => {
      const payload = await checkedPayload(fetcher, "/api/portal/agency-finance/categories");
      if (!Array.isArray(payload.categories)) throw new Error("Expense categories were missing.");
      return payload.categories as ExpenseCategory[];
    }, [], "Expense categories could not be read. Retry before changing them."),
  ]);

  return { editor, contacts, categories };
}
