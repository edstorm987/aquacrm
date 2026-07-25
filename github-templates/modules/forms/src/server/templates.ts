// Form-template service. CRUD + idempotent seedDefaults +
// instantiate-from-template helper.

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type {
  CreateTemplateInput,
  FormTemplate,
  TemplateCategory,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";

const TPL_INDEX_KEY = "templates/index";
const tplKey = (id: string): string => `templates/by-id/${id}`;

// Three default templates. Agency owners customise / archive; new
// templates added per-need.
export const DEFAULT_TEMPLATES: readonly Omit<CreateTemplateInput, "submitAction">[] = [
  {
    name: "Contact",
    description: "Basic contact form — name + email + message.",
    category: "contact",
    fields: [
      { id: "name", kind: "text", label: "Name", required: true },
      { id: "email", kind: "email", label: "Email", required: true },
      { id: "message", kind: "textarea", label: "Message", required: true },
    ],
  },
  {
    name: "Newsletter Signup",
    description: "Email-only signup; redirects to a thank-you message.",
    category: "newsletter",
    fields: [
      { id: "email", kind: "email", label: "Email address", required: true, attributeKey: "email" },
      { id: "interests", kind: "multiselect", label: "I'm interested in",
        required: false,
        options: [
          { value: "news", label: "Product news" },
          { value: "tutorials", label: "Tutorials" },
          { value: "offers", label: "Special offers" },
        ] },
    ],
  },
  {
    name: "Lead Capture",
    description: "Higher-intent form for sales pipelines.",
    category: "lead",
    fields: [
      { id: "name", kind: "text", label: "Full name", required: true },
      { id: "email", kind: "email", label: "Work email", required: true },
      { id: "company", kind: "text", label: "Company", required: false, attributeKey: "company" },
      { id: "phone", kind: "phone", label: "Phone", required: false, attributeKey: "phone" },
      { id: "budget", kind: "select", label: "Budget",
        required: false,
        options: [
          { value: "<10k", label: "Under £10k" },
          { value: "10-50k", label: "£10k – £50k" },
          { value: "50k+", label: "Over £50k" },
        ] },
      { id: "notes", kind: "textarea", label: "Tell us about your project", required: false },
    ],
  },
] as const;

export class TemplateService {
  constructor(
    private agencyId: AgencyId,
    private clientId: ClientId | undefined,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  async list(): Promise<FormTemplate[]> {
    const ids = (await this.storage.get<string[]>(TPL_INDEX_KEY)) ?? [];
    const out: FormTemplate[] = [];
    for (const id of ids) {
      const row = await this.storage.get<FormTemplate>(tplKey(id));
      if (row) out.push(row);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  async listActive(): Promise<FormTemplate[]> {
    return (await this.list()).filter(t => t.status === "active");
  }

  async get(id: string): Promise<FormTemplate | null> {
    const row = await this.storage.get<FormTemplate>(tplKey(id));
    return row && row.agencyId === this.agencyId && row.clientId === this.clientId ? row : null;
  }

  async create(input: CreateTemplateInput, actor: UserId): Promise<FormTemplate> {
    if (!input.name.trim()) throw new Error("Template name required.");
    if (!input.fields || input.fields.length === 0) throw new Error("Template must have at least one field.");
    const id = makeId("ftpl");
    const ts = now();
    const row: FormTemplate = {
      id,
      agencyId: this.agencyId,
      clientId: this.clientId,
      name: input.name.trim(),
      description: input.description,
      category: input.category,
      fields: input.fields,
      submitAction: input.submitAction,
      isDefault: false,
      status: "active",
      createdAt: ts,
      updatedAt: ts,
    };
    await this.storage.set(tplKey(id), row);
    const ix = (await this.storage.get<string[]>(TPL_INDEX_KEY)) ?? [];
    if (!ix.includes(id)) {
      await this.storage.set(TPL_INDEX_KEY, [...ix, id]);
    }
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "forms",
      action: "forms.template.created",
      message: `Created form template "${row.name}".`,
      metadata: { templateId: id },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId }, "forms.template.created", { templateId: id });
    return row;
  }

  // Idempotent. Seeds DEFAULT_TEMPLATES on first install.
  async seedDefaults(actor: UserId): Promise<{ seeded: number; existed: number }> {
    const existing = await this.list();
    if (existing.length > 0) return { seeded: 0, existed: existing.length };
    let seeded = 0;
    for (const def of DEFAULT_TEMPLATES) {
      try {
        const tpl = await this.create({
          name: def.name,
          description: def.description,
          category: def.category as TemplateCategory,
          fields: [...def.fields],
          submitAction: { kind: "thank-you", thankYouMessage: "Thanks — we'll be in touch." },
        }, actor);
        await this.storage.set(tplKey(tpl.id), { ...tpl, isDefault: true });
        seeded += 1;
      } catch {
        // Concurrent seed — ignore.
      }
    }
    return { seeded, existed: 0 };
  }
}
