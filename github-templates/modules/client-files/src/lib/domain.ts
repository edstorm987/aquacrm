// Client-files domain.

import type { ClientId, UserId } from "./tenancy";

export type FileCategory =
  | "brand-assets"
  | "brief-strategy"
  | "deliverables"
  | "invoices"
  | "misc";

export const FILE_CATEGORIES: readonly FileCategory[] =
  ["brand-assets", "brief-strategy", "deliverables", "invoices", "misc"] as const;

export const CATEGORY_LABELS: Record<FileCategory, string> = {
  "brand-assets": "Brand assets",
  "brief-strategy": "Brief & strategy",
  deliverables: "Deliverables",
  invoices: "Invoices",
  misc: "Misc",
};

// Inline cap — files at or below this size are persisted as base64
// directly under the plugin storage; larger uploads store as `external`
// stubs that record the metadata + a placeholder storageRef for T6 to
// wire S3 against. The threshold is intentionally conservative — the
// portal storage is a JSON blob in v1, so megabyte-sized payloads live
// fine but only for a handful of items.
export const INLINE_MAX_BYTES = 2 * 1024 * 1024;

// "inline" → bytes are inside the plugin store (base64 in
// `body`).
// "external" → caller is responsible for providing a `storageRef`
// that resolves to the actual bytes (S3 key, filesystem path,
// signed-URL generator id, etc).
export type FileStorageKind = "inline" | "external";

export interface FileMetadata {
  id: string;
  agencyId: string;
  clientId: ClientId;
  category: FileCategory;
  name: string;
  mimeType: string;
  sizeBytes: number;
  storage: FileStorageKind;
  storageRef: string;        // for "inline": "inline:<id>"; for "external": opaque caller string
  uploadedBy: UserId;
  uploadedAt: number;
  visibleToClient: boolean;  // false → agency-only
  shareLinkToken?: string;   // when issued; rotates on each set-share-link
  shareLinkAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface UploadInput {
  category: FileCategory;
  name: string;
  mimeType: string;
  // Either inline bytes (base64) or an external reference. When both
  // are supplied, `body` wins.
  body?: string;             // base64
  external?: { storageRef: string; sizeBytes: number };
  visibleToClient?: boolean;
}

export interface FileFilter {
  category?: FileCategory;
  query?: string;
  visibleToClient?: boolean;
}

export interface FileWithBody extends FileMetadata {
  body?: string;             // populated for inline files via getById
  externalRef?: string;      // populated for external — same as storageRef
}

// Categorical breakdown for the page tile-grid.
export interface CategoryCount {
  category: FileCategory;
  count: number;
  totalBytes: number;
}
