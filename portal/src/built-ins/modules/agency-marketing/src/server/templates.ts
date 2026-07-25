// Email-template service. CRUD + idempotent seedDefaults.
//
// Storage:
//   templates/by-id/<id>             → EmailTemplate
//   templates/index                  → string[] of template ids

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  CreateTemplateInput,
  EmailTemplate,
  TemplateFilter,
  UpdateTemplatePatch,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";

const TPL_INDEX_KEY = "templates/index";
const tplKey = (id: string): string => `templates/by-id/${id}`;

// Three default templates seeded on install. Agency owners customise
// or archive them; new templates are added per-need.
export const DEFAULT_TEMPLATES: readonly Omit<CreateTemplateInput, "bodyText">[] = [
  {
    name: "Welcome",
    subject: "Welcome aboard, {{firstName}}",
    bodyHtml: `<p>Hi {{firstName}},</p>
<p>Thanks for signing up. We're excited to have you with us.</p>
<p>Here's what's next: take a look around your account, and reach out
if anything's unclear.</p>
<p>— The team</p>`,
    category: "welcome",
  },
  {
    name: "Re-engagement",
    subject: "We've missed you",
    bodyHtml: `<p>Hi {{firstName}},</p>
<p>It's been a while since you've checked in. Here's what's new since
you were last around:</p>
<ul><li>Highlight 1</li><li>Highlight 2</li></ul>
<p>Drop in any time.</p>`,
    category: "re-engagement",
  },
  {
    name: "Newsletter",
    subject: "{{month}} highlights",
    bodyHtml: `<p>Hi {{firstName}},</p>
<p>Here's the {{month}} round-up of what we've been up to.</p>
<h2>This month's highlights</h2>
<ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>
<p>Until next month — the team.</p>`,
    category: "newsletter",
  },
] as const;

export class TemplateService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  async list(filter?: TemplateFilter): Promise<EmailTemplate[]> {
    const ids = (await this.storage.get<string[]>(TPL_INDEX_KEY)) ?? [];
    const out: EmailTemplate[] = [];
    for (const id of ids) {
      const row = await this.storage.get<EmailTemplate>(tplKey(id));
      if (row) out.push(row);
    }
    return out
      .filter(t => !filter?.category || t.category === filter.category)
      .filter(t => !filter?.status || t.status === filter.status)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async listActive(): Promise<EmailTemplate[]> {
    return (await this.list()).filter(t => t.status === "active");
  }

  async get(id: string): Promise<EmailTemplate | null> {
    const row = await this.storage.get<EmailTemplate>(tplKey(id));
    return row && row.agencyId === this.agencyId ? row : null;
  }

  async create(input: CreateTemplateInput, actor: UserId): Promise<EmailTemplate> {
    if (!input.name.trim()) throw new Error("Template name required.");
    if (!input.subject.trim()) throw new Error("Template subject required.");
    if (!input.bodyHtml.trim()) throw new Error("Template body required.");
    const id = makeId("tpl");
    const ts = now();
    const row: EmailTemplate = {
      id,
      agencyId: this.agencyId,
      name: input.name.trim(),
      subject: input.subject.trim(),
      bodyHtml: input.bodyHtml,
      bodyText: input.bodyText,
      category: input.category,
      status: "active",
      isDefault: false,
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
      actorUserId: actor,
      category: "marketing",
      action: "template.created",
      message: `Created email template "${row.name}".`,
      metadata: { templateId: id, category: row.category },
    });
    this.events.emit({ agencyId: this.agencyId }, "template.created", { templateId: id });
    return row;
  }

  async update(id: string, patch: UpdateTemplatePatch, actor: UserId): Promise<EmailTemplate | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const next: EmailTemplate = {
      ...existing,
      ...patch,
      name: patch.name?.trim() ?? existing.name,
      subject: patch.subject?.trim() ?? existing.subject,
      updatedAt: now(),
    };
    await this.storage.set(tplKey(id), next);
    if (patch.status === "archived" && existing.status === "active") {
      await this.activity.logActivity({
        agencyId: this.agencyId,
        actorUserId: actor,
        category: "marketing",
        action: "template.archived",
        message: `Archived template "${existing.name}".`,
        metadata: { templateId: id },
      });
      this.events.emit({ agencyId: this.agencyId }, "template.archived", { templateId: id });
    }
    return next;
  }

  // Idempotent. Seeds DEFAULT_TEMPLATES on first install.
  async seedDefaults(actor: UserId): Promise<{ seeded: number; existed: number }> {
    const existing = await this.list();
    if (existing.length > 0) return { seeded: 0, existed: existing.length };
    let seeded = 0;
    for (const def of DEFAULT_TEMPLATES) {
      try {
        const tpl = await this.create(def, actor);
        // Mark seeded entries as default.
        await this.storage.set(tplKey(tpl.id), { ...tpl, isDefault: true });
        seeded += 1;
      } catch {
        // Concurrent seed — ignore.
      }
    }
    return { seeded, existed: 0 };
  }

  // Render a template with simple `{{key}}` placeholder replacement.
  // Storefront / send-time integrations use this; service stays
  // string-based + plugin-runtime-free.
  renderHtml(template: EmailTemplate, vars: Record<string, string>): string {
    return substitute(template.bodyHtml, vars);
  }
  renderSubject(template: EmailTemplate, vars: Record<string, string>): string {
    return substitute(template.subject, vars);
  }
}

function substitute(input: string, vars: Record<string, string>): string {
  return input.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    return vars[key] !== undefined ? vars[key]! : `{{${key}}}`;
  });
}
