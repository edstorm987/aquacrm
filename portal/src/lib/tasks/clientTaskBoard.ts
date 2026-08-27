import type { AgencyTaskStatus, ClientTaskBoardColumnId } from "@/server/types";

export const CLIENT_TASK_BOARD_COLUMNS: ReadonlyArray<{
  id: ClientTaskBoardColumnId;
  label: string;
  status: AgencyTaskStatus;
}> = [
  { id: "backlog", label: "Backlog", status: "todo" },
  { id: "this-week", label: "This Week", status: "todo" },
  { id: "doing", label: "Doing", status: "in-progress" },
  { id: "waiting-on-client", label: "Waiting On Client", status: "in-progress" },
  { id: "review", label: "Review", status: "in-progress" },
  { id: "done", label: "Done", status: "done" },
];

const COLUMN_IDS = new Set<ClientTaskBoardColumnId>(CLIENT_TASK_BOARD_COLUMNS.map(column => column.id));

export function isClientTaskBoardColumn(value: unknown): value is ClientTaskBoardColumnId {
  return typeof value === "string" && COLUMN_IDS.has(value as ClientTaskBoardColumnId);
}

export function clientTaskStatusForColumn(columnId: ClientTaskBoardColumnId): AgencyTaskStatus {
  return CLIENT_TASK_BOARD_COLUMNS.find(column => column.id === columnId)?.status ?? "todo";
}

export function clientTaskColumnForStatus(
  status: AgencyTaskStatus,
  current?: ClientTaskBoardColumnId,
): ClientTaskBoardColumnId {
  if (status === "done") return "done";
  if (status === "todo") return current === "backlog" || current === "this-week" ? current : "backlog";
  return current === "doing" || current === "waiting-on-client" || current === "review" ? current : "doing";
}
