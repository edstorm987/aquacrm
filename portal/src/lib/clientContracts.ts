export type ClientContractStatus = "draft" | "sent" | "accepted" | "declined";

export interface ClientContract {
  id: string;
  title: string;
  summary?: string;
  documentUrl?: string;
  status: ClientContractStatus;
  createdAt: number;
  updatedAt: number;
  issuedAt?: number;
  acceptedAt?: number;
  acceptedBy?: string;
  declinedAt?: number;
  declinedBy?: string;
}
