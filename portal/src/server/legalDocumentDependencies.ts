import "server-only";

// What still points at a filed legal document — the inventory a removal
// decision needs.
//
// The roadmap's dependency-safe legal-register retirement item names the gap:
// permanent deletion removed only the register row, while the records citing
// it kept the id. Two families hold one:
//
//   • a finance obligation's `linkedLegalDocumentId` — the insurance policy or
//     filing evidence behind a renewal. The obligation card derives its
//     "Open document" link with a `find()`, so a purged document does not
//     raise anything: the link simply is not rendered and the obligation looks
//     like it never had evidence attached.
//   • a governance decision's `documentId` — the minute or resolution that
//     authorises a capital action. `reconcileCapitalPlan` refuses a SAVE that
//     cites a missing document, but nothing stopped the document being deleted
//     out from under a decision that already cited it, and the register then
//     prints the dangling id as though the evidence were still openable.
//
// Both failures are silent, and silence is the danger: compliance evidence
// that vanishes without a trace is worse than evidence that was never filed,
// because the surrounding record still claims it exists.
//
// ── Where the references actually live ────────────────────────────────────
//
// Neither is a plain top-level column, which is why a `state.legalDocuments`
// delete looks complete:
//
//   • finance obligations live in PLUGIN DATA, under every `agency-finance`
//     install — enabled or not, see `financeInstallIds` below:
//     state.pluginData[installId]["operations/obligations/by-id/*"].
//     Core reading a plugin's rows through those keys is the existing house
//     precedent (lib/server/inbox/operationalAlerts.ts).
//   • governance decisions are NESTED inside the company profile's capital
//     plan (CompanyProfile.capital.decisions[]), and there is one profile per
//     trading company plus the agency-wide one, so every profile in the agency
//     has to be walked.
//
// ── This module answers "what would break?", and detaches when told to ─────
//
// The policy itself lives at the call sites: archive by default, refuse a
// permanent delete that would strand anything, and allow an explicit,
// logged detach. This file supplies the one inventory both the confirmation
// UI and the server command ask, plus the single-pass detach so a purge can
// clear every reference in the same transaction as the row.

import { getState, mutate } from "./storage";
import type { CompanyProfile, PortalState } from "./types";

const OBLIGATION_KEY_PREFIX = "operations/obligations/by-id/";

/** Which family a dependant belongs to — the grouping a dialog shows. */
export type LegalDocumentDependantKind = "finance-obligation" | "governance-decision";

/** One record that would be left holding a dangling document id. */
export interface LegalDocumentDependant {
  kind: LegalDocumentDependantKind;
  /** The id of the record a person would go and fix. */
  id: string;
  /** Human label, so a dialog can name it without a second lookup. */
  label: string;
  /**
   * True when the reference lives inside a parent record rather than in a
   * collection of its own — the ones a per-collection sweep misses.
   */
  nested: boolean;
  /** Where a person goes to deal with it, in words rather than a route. */
  location: string;
}

export interface LegalDocumentDependencyInventory {
  documentId: string;
  dependants: LegalDocumentDependant[];
  /** `dependants.length`, for a caller that only needs "is it safe?". */
  total: number;
  byKind: Record<string, number>;
}

const label = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Every agency-finance install for this agency, INCLUDING disabled ones.
 *
 * A read-only feed like `operationalAlerts.ts` filters on `enabled`, because a
 * switched-off module should not raise work. A retirement guard must not:
 * disabling an install keeps `state.pluginData[installId]` exactly where it is
 * (only `deleteInstall` removes it, `pluginInstalls.ts`), so those obligations
 * come back the moment the module is switched on again. Skipping them would
 * let a toggle turn the guard off — the inventory would report "nothing cites
 * it", the purge would succeed, and the obligation would return holding an id
 * that is no longer in the register, with no detach recorded anywhere.
 */
function financeInstallIds(state: PortalState, agencyId: string): string[] {
  return Object.values(state.pluginInstalls ?? {})
    .filter(install => install.agencyId === agencyId && install.pluginId === "agency-finance")
    .map(install => install.id);
}

/**
 * Every governance decision in the agency, with the profile key it lives under
 * so a detach can rewrite the right profile.
 */
function governanceDecisionSites(state: PortalState, agencyId: string): Array<{ profileKey: string; profile: CompanyProfile }> {
  return Object.entries(state.companyProfiles ?? {})
    .filter(([, profile]) => profile?.agencyId === agencyId)
    .map(([profileKey, profile]) => ({ profileKey, profile }));
}

/**
 * Everything in this agency that still names `documentId`.
 *
 * Pure over the state it is handed, so a caller can run it inside a
 * transaction before committing a removal and get an answer about the same
 * snapshot the removal will act on.
 */
export function collectLegalDocumentDependants(
  state: PortalState,
  agencyId: string,
  documentId: string,
): LegalDocumentDependant[] {
  const found: LegalDocumentDependant[] = [];
  if (!documentId) return found;

  // ── Finance obligations, held in plugin data ────────────────────────────
  for (const installId of financeInstallIds(state, agencyId)) {
    for (const [key, value] of Object.entries(state.pluginData?.[installId] ?? {})) {
      if (!key.startsWith(OBLIGATION_KEY_PREFIX) || !isRecord(value)) continue;
      if (value.agencyId !== agencyId) continue;
      if (value.linkedLegalDocumentId !== documentId) continue;
      found.push({
        kind: "finance-obligation",
        id: typeof value.id === "string" ? value.id : key.slice(OBLIGATION_KEY_PREFIX.length),
        label: label(value.name, "Untitled financial obligation"),
        nested: false,
        location: "Finance · Operations",
      });
    }
  }

  // ── Governance decisions, nested in each company profile's capital plan ──
  for (const { profile } of governanceDecisionSites(state, agencyId)) {
    for (const decision of profile.capital?.decisions ?? []) {
      if (decision.documentId !== documentId) continue;
      found.push({
        kind: "governance-decision",
        id: decision.id,
        label: label(decision.title, "Untitled executive decision"),
        nested: true,
        location: "Battle Table · Capital and ownership",
      });
    }
  }

  return found;
}

/** The inventory, grouped and counted, for a confirmation surface. */
export function legalDocumentDependencyInventory(agencyId: string, documentId: string): LegalDocumentDependencyInventory {
  const dependants = collectLegalDocumentDependants(getState(), agencyId, documentId);
  const byKind: Record<string, number> = {};
  for (const dependant of dependants) byKind[dependant.kind] = (byKind[dependant.kind] ?? 0) + 1;
  return { documentId, dependants, total: dependants.length, byKind };
}

/** Is removing this document safe RIGHT NOW, with nothing left holding its id? */
export function legalDocumentHasDependants(agencyId: string, documentId: string): boolean {
  return collectLegalDocumentDependants(getState(), agencyId, documentId).length > 0;
}

/**
 * Clear every reference to `documentId`, in the state the caller is already
 * mutating.
 *
 * Exported as a pure state edit rather than its own transaction so a purge can
 * detach and delete the row in ONE `mutate` — a half-applied detach would be
 * the same silent damage this module exists to prevent, with the register row
 * gone and some citations still holding its id.
 *
 * Returns what it actually cleared, so the caller can log the reconciliation
 * by name instead of claiming a number it did not verify.
 */
export function applyLegalDocumentDetach(
  state: PortalState,
  agencyId: string,
  documentId: string,
): LegalDocumentDependant[] {
  const detached = collectLegalDocumentDependants(state, agencyId, documentId);
  if (!detached.length) return detached;
  const now = Date.now();

  for (const installId of financeInstallIds(state, agencyId)) {
    for (const [key, value] of Object.entries(state.pluginData?.[installId] ?? {})) {
      if (!key.startsWith(OBLIGATION_KEY_PREFIX) || !isRecord(value)) continue;
      if (value.agencyId !== agencyId || value.linkedLegalDocumentId !== documentId) continue;
      // Empty string, not `undefined`: that is what the finance writer stores
      // for "no linked document" (`cleanText`), so a detached obligation is
      // indistinguishable from one that never had a document.
      state.pluginData[installId][key] = { ...value, linkedLegalDocumentId: "", updatedAt: now };
    }
  }

  for (const { profileKey, profile } of governanceDecisionSites(state, agencyId)) {
    const decisions = profile.capital?.decisions ?? [];
    if (!decisions.some(decision => decision.documentId === documentId)) continue;
    state.companyProfiles[profileKey] = {
      ...profile,
      capital: {
        ...profile.capital,
        decisions: decisions.map(decision => decision.documentId === documentId
          ? { ...decision, documentId: undefined }
          : decision),
      },
      // The plan genuinely changed, so the revision moves. An editor holding
      // the old revision will be told the plan changed elsewhere rather than
      // silently re-saving the citation this detach just removed.
      revision: (profile.revision ?? 0) + 1,
      updatedAt: now,
    };
  }

  return detached;
}

/**
 * Detach on its own, for a caller that is not already inside a `mutate`.
 * The purge path does NOT use this — it needs the edit in its own transaction.
 */
export function detachLegalDocumentDependants(agencyId: string, documentId: string): LegalDocumentDependant[] {
  let detached: LegalDocumentDependant[] = [];
  mutate(state => { detached = applyLegalDocumentDetach(state, agencyId, documentId); });
  return detached;
}

/** One sentence naming what would be stranded, for an error a person reads. */
export function describeLegalDocumentDependants(dependants: LegalDocumentDependant[]): string {
  const shown = dependants.slice(0, 4).map(dependant => `${dependant.label} (${dependant.location})`);
  const remainder = dependants.length - shown.length;
  return `${dependants.length} ${dependants.length === 1 ? "record still cites" : "records still cite"} this document: ${shown.join(", ")}${remainder > 0 ? `, and ${remainder} more` : ""}.`;
}
