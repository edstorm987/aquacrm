// Content overrides — draft/publish workflow for legacy CMS keys
// (e.g. "navbar.wordmark1", "footer.tagline"). Faithful copy from
// `02 felicias aqua portal work/src/portal/server/content.ts`.

import type { AgencyId, ClientId } from "../lib/tenancy";

export type ContentValue = string | number | boolean | null;

export interface ContentSnapshot {
  id: string;
  ts: number;
  values: Record<string, ContentValue>;
  reason?: string;
  actor?: string;
}

export interface SiteContentState {
  siteId: string;
  agencyId: AgencyId;
  clientId: ClientId;
  draft: Record<string, ContentValue>;
  published: Record<string, ContentValue>;
  history: ContentSnapshot[];
  discoveries: Record<string, string[]>; // path -> keys discovered
  publishedAt?: number;
  draftUpdatedAt?: number;
}
