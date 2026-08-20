/**
 * The one editing loop, behind whatever face it wears.
 *
 * Aqua already edits four different things — client portals, the agency
 * website, marketing funnels, and now website source — and each grew its own
 * selection, patching, preview and publish code. They are not four problems.
 * Every one of them is:
 *
 *     map → select → patch → check → preview → publish
 *
 * What differs is only where the content lives and what "publish" means:
 * saving portal state, or committing to git. Those are adapters. Writing the
 * loop again per surface is how one editor gains an undo the others never get,
 * and how a conflict check exists in one place and silently does not in three.
 *
 * Deliberately free of React and of `server-only` so the same contract can be
 * used by a server route, a client component and a test.
 */

/** Something that can be selected and changed. */
export interface EditTarget {
  /** Stable across a re-map, so a selection survives the document reloading. */
  id: string;
  /** What the operator sees in a list — "Hero heading", "app/page.tsx:42". */
  label: string;
  /**
   * Whether this can be changed where it sits.
   *
   * `direct` is a value written in the document. `indirect` is one arriving
   * from elsewhere at render time — editing it in place appears to work and
   * then reverts, so the editor sends the operator to its real source instead.
   */
  kind: "direct" | "indirect";
  value?: string;
  /**
   * Of the value as mapped. The whole conflict story: an edit carries the
   * fingerprint of what it expects to replace, so a change made underneath is
   * refused rather than silently overwritten.
   */
  fingerprint: string;
  /** Where an `indirect` target is really defined. */
  definedAt?: string;
}

export interface EditDocument {
  /** `portal:cli_1`, `site:milesymedia/site@main` — unique per thing edited. */
  id: string;
  label: string;
  /** The document version these targets describe: a commit SHA, an updatedAt. */
  revision: string;
  targets: EditTarget[];
}

export interface EditIntent {
  targetId: string;
  /** The fingerprint the editor believed when the operator started typing. */
  expectedFingerprint: string;
  value: string;
}

export type EditRejectionReason =
  | "document-stale"
  | "unknown-target"
  | "target-changed"
  | "not-editable"
  | "no-change";

export interface EditRejection {
  reason: EditRejectionReason;
  /** Written for the operator: what happened and what to do about it. */
  detail: string;
  targetId: string;
}

export interface EditChange {
  target: EditTarget;
  before: string;
  after: string;
}

export interface EditPlan {
  documentId: string;
  revision: string;
  changes: EditChange[];
  rejected: EditRejection[];
}

/**
 * Works out which edits are still valid, without applying anything.
 *
 * Pure, so every surface gets the same answer and the awkward cases can be
 * tested without a database, a repository or a browser.
 */
export function planEdits(input: {
  document: EditDocument;
  /** The revision the document is at right now, which may have moved. */
  currentRevision: string;
  intents: EditIntent[];
}): EditPlan {
  const { document, currentRevision, intents } = input;
  const plan: EditPlan = { documentId: document.id, revision: document.revision, changes: [], rejected: [] };

  // Checked once, before anything else: if the document moved, every
  // fingerprint below describes a version that no longer exists, so the other
  // checks would be answering the wrong question rather than merely failing.
  if (document.revision !== currentRevision) {
    return {
      ...plan,
      rejected: intents.map(intent => ({
        reason: "document-stale" as const,
        targetId: intent.targetId,
        detail: `${document.label} has changed since it was opened. Reload before editing.`,
      })),
    };
  }

  const byId = new Map(document.targets.map(target => [target.id, target]));
  // Later intents see earlier ones, so two edits to one target both count
  // rather than the second being judged against a stale fingerprint.
  const fingerprints = new Map<string, string>();

  for (const intent of intents) {
    const target = byId.get(intent.targetId);
    if (!target) {
      plan.rejected.push({ reason: "unknown-target", targetId: intent.targetId, detail: "That is no longer part of this document." });
      continue;
    }
    if (target.kind === "indirect") {
      plan.rejected.push({
        reason: "not-editable", targetId: intent.targetId,
        detail: target.definedAt
          ? `“${target.label}” comes from ${target.definedAt}. Edit it there and it will change everywhere it appears.`
          : `“${target.label}” is generated at render time and cannot be edited here.`,
      });
      continue;
    }
    const current = fingerprints.get(target.id) ?? target.fingerprint;
    if (current !== intent.expectedFingerprint) {
      plan.rejected.push({
        reason: "target-changed", targetId: intent.targetId,
        detail: `“${target.label}” was changed by someone else while you were editing. Reload to see their version.`,
      });
      continue;
    }
    if ((target.value ?? "") === intent.value) {
      plan.rejected.push({ reason: "no-change", targetId: intent.targetId, detail: `“${target.label}” is already exactly that.` });
      continue;
    }
    fingerprints.set(target.id, intent.value);
    plan.changes = [
      ...plan.changes.filter(change => change.target.id !== target.id),
      { target, before: target.value ?? "", after: intent.value },
    ];
  }

  return plan;
}

/**
 * Whether a plan may be published.
 *
 * All-or-nothing on purpose, everywhere. A portal with half its blocks updated
 * and a website with half its files committed fail the same way: the result is
 * a state nobody chose, discovered by whoever looks at it next.
 */
export function isPublishable(plan: EditPlan): boolean {
  return plan.changes.length > 0 && plan.rejected.length === 0;
}

export interface PublishOutcome {
  published: boolean;
  /** What was, or would have been, changed. */
  changes: EditChange[];
  rejected: EditRejection[];
  summary: string;
  /** The new revision after publishing — a commit SHA, a timestamp. */
  revision?: string;
}

/**
 * Where the content actually lives.
 *
 * The only thing a surface has to write. Everything above is shared, so a new
 * editor is an adapter rather than another copy of the loop.
 */
export interface EditAdapter {
  /** Reads the document and everything selectable in it. */
  map(): Promise<EditDocument>;
  /** The revision right now, used to catch the document moving underneath. */
  currentRevision(): Promise<string>;
  /**
   * Makes the plan real. Called only when `confirm` is exactly `true` — the
   * engine never lets a truthy value stand in for a decision to publish.
   */
  publish(plan: EditPlan): Promise<{ revision: string; summary: string }>;
}

/**
 * The loop itself: check, then either describe or do.
 *
 * A dry run returns the same shape as a real publish, so the operator confirms
 * the thing they read rather than approving a summary and getting something
 * else.
 */
export async function runEdits(input: {
  adapter: EditAdapter;
  intents: EditIntent[];
  confirm?: boolean;
}): Promise<PublishOutcome> {
  const document = await input.adapter.map();
  const currentRevision = await input.adapter.currentRevision();
  const plan = planEdits({ document, currentRevision, intents: input.intents });

  if (!isPublishable(plan)) {
    return {
      published: false,
      changes: plan.changes,
      rejected: plan.rejected,
      summary: plan.rejected.length
        ? `Not published — ${plan.rejected.length} edit${plan.rejected.length === 1 ? "" : "s"} could not be applied.`
        : "Nothing to publish.",
    };
  }

  if (input.confirm !== true) {
    return {
      published: false,
      changes: plan.changes,
      rejected: [],
      summary: `Dry run · would change ${plan.changes.length} item${plan.changes.length === 1 ? "" : "s"} in ${document.label}`,
    };
  }

  const result = await input.adapter.publish(plan);
  return { published: true, changes: plan.changes, rejected: [], summary: result.summary, revision: result.revision };
}
