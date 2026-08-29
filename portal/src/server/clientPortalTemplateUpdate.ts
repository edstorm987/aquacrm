import "server-only";

// The Update button — "what changes, and what conflicts".
//
// Ed, 2026-08-27, deciding what happens to a client portal when the template it
// was seeded from moves on:
//
//   "update button with changes and possible conflicts — in other words, in
//    future as I update my services I can have legacy clients etc on older
//    versions for whatever reason."
//
// So an instance sitting on an old template version is a SUPPORTED STATE, not
// drift to be cleaned up. Nothing here updates anything: this module only
// computes the answer a human needs before pressing the button.
//
// The comparison is three-way, and `ClientPortalInstanceRecord.templateVersionId`
// is what makes it possible — it is the merge base:
//
//   base     the template document as it was when this client was seeded
//   incoming the template's current published document
//   current  what this client actually has published now
//
// From which:
//   • the template changed a field the client never touched → CLEAN, safe.
//   • the template changed a field the client also changed  → CONFLICT, a
//     person decides, because applying it would silently discard their work.
//   • the client already matches the new value              → nothing to do.
//
// The existing `resetClientPortalFromTemplate` is the blunt instrument this
// exists to replace at the UI: it overwrites the instance wholesale with the
// template's published document, discarding any client edit without warning.

import type {
  ClientPortalDesignDocument,
  ClientPortalInstanceRecord,
  ClientPortalTemplateRecord,
} from "@/server/types";

export type PortalUpdateChangeStatus = "clean" | "conflict" | "already-matches";

export interface PortalUpdateChange {
  /** Dotted path into the design document, e.g. `theme.accentColor`. */
  path: string;
  /** The value when this client was seeded. `undefined` = the field did not exist. */
  base: unknown;
  /** What the template says now. */
  incoming: unknown;
  /** What this client has now. */
  current: unknown;
  status: PortalUpdateChangeStatus;
}

export interface PortalTemplateUpdatePlan {
  templateId: string;
  templateName: string;
  /** The version this client is pinned to. */
  fromVersionId: string;
  /** The template's current published version. */
  toVersionId: string;
  /** Nothing to offer: the client is already on the current version. */
  upToDate: boolean;
  /**
   * Whether the seeded base document was still in the template's version
   * history. When false the three-way comparison is impossible and every
   * difference is reported as a conflict — an honest "we cannot tell what you
   * changed" rather than a confident merge built on a guess.
   */
  baseKnown: boolean;
  /** Everything the template changed since this client was seeded. */
  changes: PortalUpdateChange[];
  /** The subset that would overwrite something this client changed. */
  conflicts: PortalUpdateChange[];
  /** The subset that applies without touching any client edit. */
  clean: PortalUpdateChange[];
}

/** Deep, order-insensitive value comparison for plain design documents. */
function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || right === null) return false;
  if (typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => sameValue(item, right[index]));
  }
  const leftKeys = Object.keys(left as Record<string, unknown>).sort();
  const rightKeys = Object.keys(right as Record<string, unknown>).sort();
  if (leftKeys.length !== rightKeys.length || leftKeys.some((key, i) => key !== rightKeys[i])) return false;
  return leftKeys.every(key => sameValue(
    (left as Record<string, unknown>)[key],
    (right as Record<string, unknown>)[key],
  ));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Every leaf path where two documents differ.
 *
 * Arrays are compared whole rather than element-by-element: a reordered block
 * list is one decision for a person, not twenty, and pretending otherwise
 * produces a conflict list nobody reads.
 */
function differingPaths(left: unknown, right: unknown, prefix = ""): string[] {
  if (sameValue(left, right)) return [];
  if (!isPlainObject(left) || !isPlainObject(right)) return [prefix || "."];
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  return keys.flatMap(key => differingPaths(left[key], right[key], prefix ? `${prefix}.${key}` : key));
}

function valueAt(document: unknown, path: string): unknown {
  if (path === ".") return document;
  let cursor: unknown = document;
  for (const segment of path.split(".")) {
    if (!isPlainObject(cursor)) return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

export interface PlanTemplateUpdateInput {
  template: ClientPortalTemplateRecord;
  instance: ClientPortalInstanceRecord;
}

/**
 * Work out what pressing Update would do to ONE client's portal.
 *
 * Pure: reads the two records and returns a description. It never mutates, so
 * it is safe to call to render a list of clients and what each would receive.
 */
export function planClientPortalTemplateUpdate(
  input: PlanTemplateUpdateInput,
): PortalTemplateUpdatePlan {
  const { template, instance } = input;
  const toVersionId = template.publishedVersionId;
  const fromVersionId = instance.templateVersionId;
  const incoming = template.published;
  const current = instance.published;

  const seeded = template.versions.find(version => version.id === fromVersionId);
  const baseKnown = Boolean(seeded) || fromVersionId === toVersionId;
  // When the pinned version is gone, comparing against the template's CURRENT
  // document would make every client edit look like a template change. Use the
  // client's own document as the base instead: that reports the real
  // differences and marks them all as needing a person, which is the honest
  // answer when history cannot tell us who changed what.
  const base: ClientPortalDesignDocument = seeded?.document
    ?? (fromVersionId === toVersionId ? incoming : current);

  if (fromVersionId === toVersionId) {
    return {
      templateId: template.id,
      templateName: template.name,
      fromVersionId,
      toVersionId,
      upToDate: true,
      baseKnown: true,
      changes: [],
      conflicts: [],
      clean: [],
    };
  }

  const changes: PortalUpdateChange[] = differingPaths(base, incoming).map(path => {
    const baseValue = valueAt(base, path);
    const incomingValue = valueAt(incoming, path);
    const currentValue = valueAt(current, path);
    const clientChangedIt = !sameValue(currentValue, baseValue);
    const status: PortalUpdateChangeStatus = sameValue(currentValue, incomingValue)
      ? "already-matches"
      : !baseKnown || clientChangedIt
        ? "conflict"
        : "clean";
    return { path, base: baseValue, incoming: incomingValue, current: currentValue, status };
  });

  return {
    templateId: template.id,
    templateName: template.name,
    fromVersionId,
    toVersionId,
    upToDate: changes.length === 0,
    baseKnown,
    changes,
    conflicts: changes.filter(change => change.status === "conflict"),
    clean: changes.filter(change => change.status === "clean"),
  };
}

/**
 * One line a human can read next to a client's name.
 *
 * Deliberately neutral about staying behind: a legacy client on an old version
 * is a decision somebody made, not a warning to clear.
 */
export function describeTemplateUpdate(plan: PortalTemplateUpdatePlan): string {
  if (plan.upToDate) return "On the current version.";
  const changeCount = plan.changes.length;
  const conflictCount = plan.conflicts.length;
  const changes = `${changeCount} change${changeCount === 1 ? "" : "s"}`;
  if (!plan.baseKnown) {
    return `${changes} available. The seeded version is no longer in history, so each one needs a decision.`;
  }
  if (conflictCount === 0) return `${changes} available, none affecting this client's own edits.`;
  return `${changes} available · ${conflictCount} would overwrite this client's own edits.`;
}

// ─── Applying the decisions ─────────────────────────────────────────────────
//
// The other half of the button: once a person has looked at the changes and the
// conflicts, this produces the document that results from their choices.
//
// Pure on purpose. It returns a new document and the decision record; it does
// not write, publish, or advance the version pin. Persistence is the caller's
// job because those are separate, reversible steps in this codebase (draft →
// review → publish), and a merge helper should not quietly publish to a live
// client portal.
//
// The pin semantics the caller should follow, and why:
//
//   • ACCEPT EVERYTHING → the instance is genuinely on the new template
//     version. Advance `templateVersionId` to `plan.toVersionId`.
//   • ACCEPT SOME → this is a merge, and the declined changes are RESOLVED, not
//     pending. Advance the pin too, and keep the client's values for what they
//     declined. Otherwise the same declined change is offered forever, which is
//     how a person learns to ignore the button.
//   • ACCEPT NOTHING → do not advance anything. The client stays legacy, which
//     is a supported state, and the offer stands next time.

export interface ApplyTemplateUpdateInput {
  plan: PortalTemplateUpdatePlan;
  /** The client's current document — the one the plan's `current` came from. */
  current: ClientPortalDesignDocument;
  /** Paths from `plan.changes` the person accepted. Unknown paths are ignored. */
  accept: readonly string[];
}

export interface ApplyTemplateUpdateResult {
  /** The client's document after the accepted changes. A new object. */
  document: ClientPortalDesignDocument;
  accepted: PortalUpdateChange[];
  declined: PortalUpdateChange[];
  /** True when every offered change was taken, so the caller may advance the pin fully. */
  fullyApplied: boolean;
  /**
   * Whether the caller should move `templateVersionId` to `plan.toVersionId`.
   * False only when nothing was accepted — the client stays where they are.
   */
  advanceVersionPin: boolean;
}

/** Immutable deep set. An `undefined` value removes the key the template dropped. */
function withValueAt(
  document: unknown,
  segments: readonly string[],
  value: unknown,
): unknown {
  if (segments.length === 0) return value;
  const [head, ...rest] = segments;
  const source = isPlainObject(document) ? document : {};
  const next: Record<string, unknown> = { ...source };
  if (rest.length === 0) {
    if (value === undefined) delete next[head];
    else next[head] = value;
    return next;
  }
  next[head] = withValueAt(source[head], rest, value);
  return next;
}

/**
 * Merge the accepted template changes into the client's document.
 *
 * A declined change is simply not applied: the client keeps what they had,
 * which is the whole point of showing conflicts rather than overwriting.
 */
export function applyClientPortalTemplateUpdate(
  input: ApplyTemplateUpdateInput,
): ApplyTemplateUpdateResult {
  const wanted = new Set(input.accept);
  const offered = input.plan.changes;
  const accepted = offered.filter(change => wanted.has(change.path));
  const declined = offered.filter(change => !wanted.has(change.path));

  let document: unknown = input.current;
  for (const change of accepted) {
    // `.` means the documents differ at the root — a whole-document swap.
    document = change.path === "."
      ? change.incoming
      : withValueAt(document, change.path.split("."), change.incoming);
  }

  return {
    document: document as ClientPortalDesignDocument,
    accepted,
    declined,
    fullyApplied: offered.length > 0 && declined.length === 0,
    advanceVersionPin: accepted.length > 0,
  };
}
