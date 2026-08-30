export type ClientContractStatus = "draft" | "sent" | "accepted" | "declined";

export interface ClientContractRevision {
  version: number;
  title: string;
  summary?: string;
  body?: string;
  documentUrl?: string;
  documentName?: string;
  templateId?: string;
  note?: string;
  createdAt: number;
  createdBy?: string;
}

export interface ClientContract {
  id: string;
  /** Stable browser command identity so a lost response can be retried safely. */
  creationOperationId?: string;
  /** Guards an operation id from being reused for different contract terms. */
  creationFingerprint?: string;
  title: string;
  summary?: string;
  body?: string;
  documentUrl?: string;
  documentName?: string;
  templateId?: string;
  version?: number;
  revisions?: ClientContractRevision[];
  status: ClientContractStatus;
  createdAt: number;
  updatedAt: number;
  issuedAt?: number;
  acceptedAt?: number;
  acceptedBy?: string;
  /**
   * The `version` that was actually accepted. An amendment bumps `version` and
   * resets the contract to draft, so binding acceptance to a number is what
   * stops "they accepted it" from silently meaning a later, unseen wording.
   */
  acceptedVersion?: number;
  declinedAt?: number;
  declinedBy?: string;
}

/**
 * Is there anything here a client could actually READ before agreeing to it?
 *
 * A title and an amount are not terms. Every path that puts an agreement in
 * front of a client — the canonical send, the one-button close, and acceptance
 * itself — asks this one question, so "sent" and "accepted" cannot mean an
 * empty record.
 */
export function contractHasReviewableTerms(
  contract: Pick<ClientContract, "body" | "documentUrl">,
): boolean {
  return Boolean(contract.body?.trim() || contract.documentUrl?.trim());
}

export interface ClientContractTemplate {
  id: string;
  agencyId: string;
  /** Contract this reusable template was deliberately created from, if any. */
  sourceContractId?: string;
  /** Stable command identity used to converge a retried source-contract save. */
  creationOperationId?: string;
  title: string;
  summary?: string;
  body: string;
  status: "active" | "archived";
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  source?: "library" | "product";
}
