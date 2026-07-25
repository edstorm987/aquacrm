// Kanban domain. Persisted under per-install plugin storage.
//
// A board is either agency-scoped (clientId undefined) or client-scoped
// (clientId set). Cards live inside a single column on a single board;
// reorder is fractional via integer `order` field renormalized on
// every move.

import type { AgencyId, ClientId, UserId } from "./tenancy";

export type BoardScope = "agency" | "client";
export type BoardStatus = "active" | "archived";

export interface Column {
  id: string;
  label: string;
  order: number;            // sort key within the board
  color?: string;           // optional hex
}

export interface Board {
  id: string;
  agencyId: AgencyId;
  clientId?: ClientId;
  scope: BoardScope;
  name: string;
  description?: string;
  templateId?: TemplateId;  // template used at creation, if any
  columns: Column[];
  status: BoardStatus;
  createdAt: number;
  updatedAt: number;
}

export interface CreateBoardInput {
  name: string;
  scope: BoardScope;
  description?: string;
  templateId?: TemplateId;
  columns?: Array<Pick<Column, "label" | "color">>;
}

export interface UpdateBoardPatch {
  name?: string;
  description?: string;
  status?: BoardStatus;
}

export type CardStatus = "active" | "archived";

export interface Card {
  id: string;
  agencyId: AgencyId;
  clientId?: ClientId;
  boardId: string;
  columnId: string;
  order: number;
  title: string;
  description?: string;
  assigneeUserId?: UserId;
  dueAt?: number;
  tags: string[];
  metadata: Record<string, unknown>;
  status: CardStatus;
  createdAt: number;
  updatedAt: number;
}

export interface CreateCardInput {
  boardId: string;
  columnId: string;
  title: string;
  description?: string;
  assigneeUserId?: UserId;
  dueAt?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateCardPatch {
  title?: string;
  description?: string;
  assigneeUserId?: UserId | null;
  dueAt?: number | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface CardFilter {
  boardId?: string;
  columnId?: string;
  status?: CardStatus;
  query?: string;
  tag?: string;
  assigneeUserId?: UserId;
}

// ─── Templates ───────────────────────────────────────────────────────────

export type TemplateId =
  | "fulfillment-mirror"
  | "lead-pipeline"
  | "client-tasks"
  | "blank"
  | "founder-todos";

export interface TemplateColumnSeed {
  label: string;
  color?: string;
}

export interface TemplateCardSeed {
  columnIndex: number;       // 0-based index into TemplateDefinition.columns
  title: string;
  description?: string;
  tags?: string[];
}

export interface TemplateDefinition {
  id: TemplateId;
  name: string;
  description: string;
  columns: TemplateColumnSeed[];
  cards: TemplateCardSeed[];
  // R2 (Aqua templates round). When set, the template is hidden from
  // the picker for operators whose role string doesn't match (case-
  // insensitive). v1 uses a single role match — multi-role gating
  // can extend to string[] later.
  requiresRole?: string;
  // When set, BoardService.create refuses to apply the template to a
  // mismatched-scope board (e.g. founder-todos is agency-only).
  requiresScope?: BoardScope;
}
