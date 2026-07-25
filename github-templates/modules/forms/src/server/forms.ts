// Form service. CRUD + status transitions + publish.
//
// Storage:
//   forms/by-id/<id>           → FormDefinition
//   forms/index                → string[] of form ids
//
// Status transitions:
//   draft     → published | archived
//   published → archived
//   archived  → (terminal)

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type {
  CreateFormInput,
  FormDefinition,
  FormFilter,
  FormStatus,
  UpdateFormPatch,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";

const FORM_INDEX_KEY = "forms/index";
const formKey = (id: string): string => `forms/by-id/${id}`;

const ALLOWED_TRANSITIONS: Record<FormStatus, FormStatus[]> = {
  draft: ["published", "archived"],
  published: ["archived"],
  archived: [],
};

export class FormService {
  constructor(
    private agencyId: AgencyId,
    private clientId: ClientId | undefined,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  async list(filter?: FormFilter): Promise<FormDefinition[]> {
    const ids = (await this.storage.get<string[]>(FORM_INDEX_KEY)) ?? [];
    const out: FormDefinition[] = [];
    for (const id of ids) {
      const row = await this.storage.get<FormDefinition>(formKey(id));
      if (row) out.push(row);
    }
    const q = filter?.query?.toLowerCase().trim();
    return out
      .filter(f => !filter?.status || f.status === filter.status)
      .filter(f => !q || f.name.toLowerCase().includes(q))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async listPublished(): Promise<FormDefinition[]> {
    return (await this.list()).filter(f => f.status === "published");
  }

  async get(id: string): Promise<FormDefinition | null> {
    const row = await this.storage.get<FormDefinition>(formKey(id));
    if (!row) return null;
    if (row.agencyId !== this.agencyId) return null;
    if (row.clientId !== this.clientId) return null;
    return row;
  }

  // Public-render path. Returns null if the form isn't published.
  async getPublishedForm(id: string): Promise<FormDefinition | null> {
    const f = await this.get(id);
    return f && f.status === "published" ? f : null;
  }

  async create(input: CreateFormInput, actor: UserId): Promise<FormDefinition> {
    if (!input.name.trim()) throw new Error("Form name required.");
    if (!input.fields || input.fields.length === 0) {
      throw new Error("Form must have at least one field.");
    }
    // Ensure each field has a unique id; auto-assign if absent.
    const fieldIds = new Set<string>();
    const fields = input.fields.map(f => {
      const id = f.id || makeId("fld");
      if (fieldIds.has(id)) throw new Error(`Duplicate field id: ${id}`);
      fieldIds.add(id);
      return { ...f, id };
    });

    const id = makeId("form");
    const ts = now();
    const row: FormDefinition = {
      id,
      agencyId: this.agencyId,
      clientId: this.clientId,
      name: input.name.trim(),
      description: input.description,
      fields,
      submitAction: input.submitAction,
      status: "draft",
      submissionCount: 0,
      spamProtection: input.spamProtection,
      createdAt: ts,
      updatedAt: ts,
    };
    await this.storage.set(formKey(id), row);
    const ix = (await this.storage.get<string[]>(FORM_INDEX_KEY)) ?? [];
    if (!ix.includes(id)) {
      await this.storage.set(FORM_INDEX_KEY, [...ix, id]);
    }
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "forms",
      action: "forms.form.created",
      message: `Drafted form "${row.name}".`,
      metadata: { formId: id, fieldCount: fields.length },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId }, "forms.form.created", { formId: id });
    return row;
  }

  async update(id: string, patch: UpdateFormPatch, actor: UserId): Promise<FormDefinition | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    if (patch.status && patch.status !== existing.status) {
      if (!ALLOWED_TRANSITIONS[existing.status].includes(patch.status)) {
        throw new Error(`Cannot transition form ${existing.name} from ${existing.status} → ${patch.status}.`);
      }
    }

    let fields = existing.fields;
    if (patch.fields) {
      const fieldIds = new Set<string>();
      fields = patch.fields.map(f => {
        const fid = f.id || makeId("fld");
        if (fieldIds.has(fid)) throw new Error(`Duplicate field id: ${fid}`);
        fieldIds.add(fid);
        return { ...f, id: fid };
      });
    }

    const next: FormDefinition = {
      ...existing,
      ...patch,
      fields,
      name: patch.name?.trim() ?? existing.name,
      updatedAt: now(),
    };
    await this.storage.set(formKey(id), next);
    if (patch.status === "archived" && existing.status !== "archived") {
      await this.activity.logActivity({
        agencyId: this.agencyId,
        clientId: this.clientId,
        actorUserId: actor,
        category: "forms",
        action: "forms.form.archived",
        message: `Archived form "${existing.name}".`,
        metadata: { formId: id },
      });
      this.events.emit({ agencyId: this.agencyId, clientId: this.clientId }, "forms.form.archived", { formId: id });
    } else {
      await this.activity.logActivity({
        agencyId: this.agencyId,
        clientId: this.clientId,
        actorUserId: actor,
        category: "forms",
        action: "forms.form.updated",
        message: `Updated form "${next.name}".`,
        metadata: { formId: id, fields: Object.keys(patch) },
      });
    }
    return next;
  }

  async publish(id: string, actor: UserId): Promise<FormDefinition | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    if (existing.status === "published") return existing;
    if (existing.status !== "draft") {
      throw new Error(`Cannot publish a ${existing.status} form.`);
    }
    const next: FormDefinition = {
      ...existing,
      status: "published",
      publishedAt: now(),
      updatedAt: now(),
    };
    await this.storage.set(formKey(id), next);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "forms",
      action: "forms.form.published",
      message: `Published form "${next.name}".`,
      metadata: { formId: id },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId }, "forms.form.published", { formId: id });
    return next;
  }

  async delete(id: string, actor: UserId): Promise<boolean> {
    const existing = await this.get(id);
    if (!existing) return false;
    if (existing.status !== "draft") {
      throw new Error(`Only draft forms can be deleted. Archive ${existing.name} instead.`);
    }
    await this.storage.del(formKey(id));
    const ix = (await this.storage.get<string[]>(FORM_INDEX_KEY)) ?? [];
    await this.storage.set(FORM_INDEX_KEY, ix.filter(x => x !== id));
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "forms",
      action: "forms.form.deleted",
      message: `Deleted draft form "${existing.name}".`,
      metadata: { formId: id },
    });
    return true;
  }

  // Internal — bumps submissionCount when SubmissionService records a row.
  async _incrementSubmissionCount(id: string): Promise<void> {
    const existing = await this.get(id);
    if (!existing) return;
    await this.storage.set(formKey(id), {
      ...existing,
      submissionCount: existing.submissionCount + 1,
    });
  }
}
