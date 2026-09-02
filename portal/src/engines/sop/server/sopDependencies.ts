import "server-only";

// What still points at a procedure — the inventory a retirement decision needs.
//
// The roadmap's dependency-safe-sop-retirement item names this as the missing
// prerequisite: *"Build a dependency inventory used by both confirmation UI and
// the server command."* Its `Why` describes the failure without it: *"Permanent
// SOP deletion removes only the source row. Guides, tasks, products and other
// operational records retain the id, while several mounted surfaces silently
// filter the missing procedure and stop presenting required work."*
//
// That last clause is the dangerous half. A dangling SOP id does not surface as
// an error; the surfaces holding it simply render one fewer step, so a checklist
// quietly gets shorter and nobody is told a required procedure went missing.
//
// ── Retirement policy ──────────────────────────────────────────────────────
//
// Hard deletion is RESTRICT: a linked procedure stays intact until every
// reference is removed or reassigned. This is the only lossless default that
// needs no guess about historical retention and cannot silently shorten an
// operating checklist. The inventory below is both the mounted explanation and
// the same-snapshot domain assertion used by the destructive command.
//
// ── Every place a SOP id can hide ─────────────────────────────────────────
//
// Nine reference sites across seven owning types, four of them NESTED inside a
// parent record rather than held in a collection of their own. The nested ones
// are why a naive `state.sops` delete looks complete:
//
//   • AgencyTask.sopIds[]                              (collection)
//   • AgencyTask.checklist[].sopId                     (nested)
//   • AgencyTaskTemplate steps[].sopId                 (nested)
//   • SopGuide.sopIds[]                                (collection)
//   • AgencyProduct.sopIds[]                           (collection)
//   • AgencyProduct.internalWorkspace.processSteps[]   (nested)
//   • ClientProductVariation.sopIds[]                  (nested in client metadata)
//   • DevelopmentResource.sopIds[]                     (collection)
//   • PeopleTrainingAssignment.sopId                   (collection)

import { getState } from "@/server/storage";
import { clientProductVariations } from "@/lib/clients/clientProductVariations";
import type { PortalState } from "@/server/types";

/** One thing that would be left holding a dangling id. */
export interface SopDependant {
  /** Which family it belongs to — the grouping a confirmation dialog shows. */
  kind:
    | "task"
    | "task-checklist-item"
    | "task-template-step"
    | "guide"
    | "product"
    | "product-process-step"
    | "client-product-variation"
    | "development-resource"
    | "training-assignment";
  /** The id of the record a person would go and fix. */
  id: string;
  /** Human label, so a dialog can name it without a second lookup. */
  label: string;
  /**
   * True when the reference lives inside a parent record rather than in a
   * collection of its own. These are the ones a per-collection sweep misses.
   */
  nested: boolean;
}

export interface SopDependencyInventory {
  sopId: string;
  /** Every dependant, newest concern first is NOT implied — order is by kind. */
  dependants: SopDependant[];
  /** `dependants.length`, for a caller that only needs "is it safe?". */
  total: number;
  byKind: Record<string, number>;
}

export class SopHasDependantsError extends Error {
  readonly code = "sop_has_dependants";

  constructor(readonly inventory: SopDependencyInventory) {
    super(
      `Cannot delete this SOP: ${inventory.total} record${inventory.total === 1 ? " still uses" : "s still use"} it. Remove or reassign those links, then retry.`,
    );
    this.name = "SopHasDependantsError";
  }
}

const label = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

/**
 * Everything in this agency that still names `sopId`.
 *
 * Pure over the state it is handed, so a caller can run it inside a transaction
 * before committing a retirement and get an answer about the same snapshot.
 */
export function collectSopDependants(
  state: PortalState,
  agencyId: string,
  sopId: string,
): SopDependant[] {
  const found: SopDependant[] = [];
  if (!sopId) return found;

  const mine = <T extends { agencyId?: string }>(record: T): boolean => record.agencyId === agencyId;

  // ── Tasks: both the task's own list and its checklist items ──────────────
  for (const task of Object.values(state.tasks ?? {})) {
    if (!mine(task)) continue;
    if (task.sopIds?.includes(sopId)) {
      found.push({ kind: "task", id: task.id, label: label(task.title, "Untitled action"), nested: false });
    }
    for (const item of task.checklist ?? []) {
      if (item.sopId === sopId) {
        found.push({
          kind: "task-checklist-item",
          id: item.id,
          label: `${label(task.title, "Untitled action")} → ${label(item.label, "step")}`,
          nested: true,
        });
      }
    }
  }

  // ── Task templates: the SOP hides on a step ─────────────────────────────
  for (const template of Object.values(state.taskTemplates ?? {})) {
    if (!mine(template)) continue;
    for (const step of template.steps ?? []) {
      if (step.sopId === sopId) {
        found.push({
          kind: "task-template-step",
          id: template.id,
          label: `${label(template.name, "Untitled template")} → ${label(step.label, "step")}`,
          nested: true,
        });
      }
    }
  }

  // ── Guides ──────────────────────────────────────────────────────────────
  for (const guide of Object.values(state.sopGuides ?? {})) {
    if (!mine(guide)) continue;
    if (guide.sopIds?.includes(sopId)) {
      found.push({ kind: "guide", id: guide.id, label: label(guide.title, "Untitled guide"), nested: false });
    }
  }

  // ── Products, and their internal workspace process steps ────────────────
  for (const product of Object.values(state.agencyProducts ?? {})) {
    if (!mine(product)) continue;
    if (product.sopIds?.includes(sopId)) {
      found.push({ kind: "product", id: product.id, label: label(product.name, "Untitled service"), nested: false });
    }
    for (const step of product.internalWorkspace?.processSteps ?? []) {
      if (step.sopIds?.includes(sopId)) {
        found.push({
          kind: "product-process-step",
          id: product.id,
          label: `${label(product.name, "Untitled service")} → ${label(step.title, "step")}`,
          nested: true,
        });
      }
    }
  }

  // ── Per-client product variations, which live in client metadata ────────
  for (const client of Object.values(state.clients ?? {})) {
    if (client.agencyId !== agencyId) continue;
    const variations = clientProductVariations((client.metadata ?? {}) as Parameters<typeof clientProductVariations>[0]);
    for (const variation of Object.values(variations)) {
      const names = variation.sopIds?.includes(sopId)
        || (variation.internalWorkspace?.processSteps ?? []).some(step => step.sopIds?.includes(sopId));
      if (names) {
        found.push({
          kind: "client-product-variation",
          id: `${client.id}:${variation.productId}`,
          label: `${label(client.name, "A client")} → ${label(variation.name, "service variation")}`,
          nested: true,
        });
      }
    }
  }

  // ── Development resources ───────────────────────────────────────────────
  for (const resource of Object.values(state.developmentResources ?? {})) {
    if (!mine(resource)) continue;
    if (resource.sopIds?.includes(sopId)) {
      found.push({ kind: "development-resource", id: resource.id, label: label(resource.title, "Untitled resource"), nested: false });
    }
  }

  // ── Training assignments ────────────────────────────────────────────────
  for (const assignment of Object.values(state.peopleTrainingAssignments ?? {})) {
    if (!mine(assignment)) continue;
    if (assignment.sopId === sopId) {
      found.push({ kind: "training-assignment", id: assignment.id, label: "A training assignment", nested: false });
    }
  }

  return found;
}

/** The inventory, grouped and counted, from one authoritative state snapshot. */
export function sopDependencyInventoryFromState(
  state: PortalState,
  agencyId: string,
  sopId: string,
): SopDependencyInventory {
  const dependants = collectSopDependants(state, agencyId, sopId);
  const byKind: Record<string, number> = {};
  for (const dependant of dependants) byKind[dependant.kind] = (byKind[dependant.kind] ?? 0) + 1;
  return { sopId, dependants, total: dependants.length, byKind };
}

/** The current inventory for read/preview surfaces. */
export function sopDependencyInventory(agencyId: string, sopId: string): SopDependencyInventory {
  return sopDependencyInventoryFromState(getState(), agencyId, sopId);
}

/** Enforce RESTRICT inside the same state mutation that would remove the SOP. */
export function assertSopHasNoDependants(
  state: PortalState,
  agencyId: string,
  sopId: string,
): SopDependencyInventory {
  const inventory = sopDependencyInventoryFromState(state, agencyId, sopId);
  if (inventory.total > 0) throw new SopHasDependantsError(inventory);
  return inventory;
}

/**
 * Is deleting this procedure safe RIGHT NOW, with nothing left holding its id?
 *
 * A convenience over the inventory for non-destructive callers.
 */
export function sopHasDependants(agencyId: string, sopId: string): boolean {
  return collectSopDependants(getState(), agencyId, sopId).length > 0;
}
