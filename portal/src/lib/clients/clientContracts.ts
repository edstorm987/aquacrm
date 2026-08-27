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
  declinedAt?: number;
  declinedBy?: string;
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
