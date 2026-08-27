import "server-only";

import { logActivity } from "./activity";
import { getState, mutate } from "./storage";
import type {
  PortalFormEditorState,
  PortalFormEntity,
  PortalFormFieldDefinition,
  PortalFormFieldType,
} from "./types";
import { validatePortalFormValues } from "@/lib/forms/portalFormValues";

// Contacts deliberately keep the Leads Pipeline contact schema because tags, imports and
// promotions share that contract. The mounted Portal Editor delegates Contacts to that
// API; refusing a second `portalEditor.forms.contacts` document prevents split-brain fields.
const ENTITIES = new Set<PortalFormEntity>(["expenses", "clients", "leads", "tasks", "products"]);
const TYPES = new Set<PortalFormFieldType>(["text", "textarea", "number", "date", "url", "email", "select", "multi-select", "checkbox"]);

export function getPortalEditorState(agencyId: string): PortalFormEditorState {
  const stored = getState().portalEditor[agencyId];
  return {
    agencyId,
    forms: stored?.forms ?? {},
    updatedAt: stored?.updatedAt ?? 0,
  };
}

export function getPortalFormFields(agencyId: string, entity: PortalFormEntity): PortalFormFieldDefinition[] {
  assertPortalEditorEntity(entity);
  return getPortalEditorState(agencyId).forms[entity] ?? [];
}

export function validatePortalEntityFields(
  agencyId: string,
  entity: PortalFormEntity,
  values: unknown,
  existing?: Record<string, unknown>,
  allowedUnknownKeys?: Iterable<string>,
) {
  return validatePortalFormValues({
    fields: getPortalFormFields(agencyId, entity),
    values,
    existing,
    allowedUnknownKeys,
  });
}

export function savePortalEditorField(
  agencyId: string,
  entity: PortalFormEntity,
  value: Partial<PortalFormFieldDefinition>,
  actorUserId: string,
): PortalFormEditorState {
  assertPortalEditorEntity(entity);
  const label = cleanText(value.label, 80);
  if (!label) throw new Error("Field label required.");
  const type = TYPES.has(value.type as PortalFormFieldType) ? value.type as PortalFormFieldType : "text";
  const options = cleanOptions(value.options);
  if ((type === "select" || type === "multi-select") && options.length === 0) {
    throw new Error("Select fields need at least one option.");
  }
  const now = Date.now();
  const id = cleanId(value.id) || `field-${now.toString(36)}`;
  const current = getPortalEditorState(agencyId);
  const fields = current.forms[entity] ?? [];
  const existing = fields.find(field => field.id === id);
  const field: PortalFormFieldDefinition = {
    id,
    label,
    type,
    options,
    section: cleanText(value.section, 80) || "Extra details",
    required: value.required === true,
    active: value.active !== false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const next: PortalFormEditorState = {
    agencyId,
    forms: {
      ...current.forms,
      [entity]: [...fields.filter(item => item.id !== id), field].sort((a, b) =>
        a.section.localeCompare(b.section) || a.label.localeCompare(b.label)),
    },
    updatedAt: now,
  };
  mutate(state => { state.portalEditor[agencyId] = next; });
  logActivity({
    agencyId,
    actorUserId,
    category: "settings",
    action: "portal_editor.field_saved",
    message: `Saved ${entity} field "${field.label}".`,
    metadata: { entity, fieldId: field.id },
  });
  return next;
}

export function deletePortalEditorField(
  agencyId: string,
  entity: PortalFormEntity,
  fieldId: string,
  actorUserId: string,
): PortalFormEditorState {
  assertPortalEditorEntity(entity);
  const current = getPortalEditorState(agencyId);
  const fields = current.forms[entity] ?? [];
  const removed = fields.find(field => field.id === fieldId);
  const next: PortalFormEditorState = {
    agencyId,
    forms: { ...current.forms, [entity]: fields.filter(field => field.id !== fieldId) },
    updatedAt: Date.now(),
  };
  mutate(state => { state.portalEditor[agencyId] = next; });
  if (removed) {
    logActivity({
      agencyId,
      actorUserId,
      category: "settings",
      action: "portal_editor.field_deleted",
      message: `Deleted ${entity} field "${removed.label}".`,
      metadata: { entity, fieldId },
    });
  }
  return next;
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanId(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 80)
    : "";
}

function cleanOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .filter((item): item is string => typeof item === "string")
    .map(item => item.trim().slice(0, 80))
    .filter(Boolean))).slice(0, 40);
}

function assertPortalEditorEntity(entity: PortalFormEntity): void {
  if (entity === "contacts") {
    throw new Error("Contacts fields use the Leads Pipeline contact configuration.");
  }
  if (!ENTITIES.has(entity)) throw new Error("Unknown form.");
}
