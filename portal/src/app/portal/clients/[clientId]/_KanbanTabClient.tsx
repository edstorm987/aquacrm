"use client";

import Link from "next/link";
import { RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { CLIENT_TASK_BOARD_COLUMNS } from "@/lib/tasks/clientTaskBoard";
import type { AgencyTask, ClientTaskBoardColumnId } from "@/server/types";

interface BoardPayload {
  ok?: boolean;
  error?: string;
  tasks?: AgencyTask[];
}

interface LegacyCard {
  id: string;
  columnId: string;
  order: number;
  title: string;
}

const WAITING_COLUMN_ID: ClientTaskBoardColumnId = "waiting-on-client";

function operationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `board-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function KanbanTabClient({
  clientId,
  clientName,
  canManage = true,
  onWaitingCount,
}: {
  clientId: string;
  clientName: string;
  canManage?: boolean;
  onWaitingCount?: (count: number) => void;
}) {
  const [tasks, setTasks] = useState<AgencyTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [draftOperationId, setDraftOperationId] = useState<string | null>(null);

  async function applyResponse(response: Response): Promise<BoardPayload> {
    const payload = await response.json().catch(() => null) as BoardPayload | null;
    if (payload?.tasks) setTasks(payload.tasks);
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || "The shared task board could not be updated.");
    return payload;
  }

  useEffect(() => {
    let active = true;
    const legacyKey = `milesymedia-client-tasks:${clientId}`;

    async function load(importLegacy: boolean) {
      try {
        if (importLegacy && canManage) {
          const stored = window.localStorage.getItem(legacyKey);
          if (stored) {
            const parsed = JSON.parse(stored) as unknown;
            if (!Array.isArray(parsed)) throw new Error("The previous local board could not be migrated safely.");
            const response = await fetch("/api/tenants/client-tasks", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ clientId, action: "import", cards: parsed as LegacyCard[] }),
            });
            const payload = await response.json().catch(() => null) as BoardPayload | null;
            if (!response.ok || !payload?.ok) throw new Error(payload?.error || "The previous local board could not be migrated.");
            if (!active) return;
            setTasks(payload.tasks ?? []);
            window.localStorage.removeItem(legacyKey);
            setError(null);
            return;
          }
        }
        const response = await fetch(`/api/tenants/client-tasks?clientId=${encodeURIComponent(clientId)}`, { cache: "no-store" });
        const payload = await response.json().catch(() => null) as BoardPayload | null;
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || "The shared task board could not be loaded.");
        if (!active) return;
        setTasks(payload.tasks ?? []);
        setError(null);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "The shared task board could not be loaded.");
        setTasks(current => current ?? []);
      }
    }

    void load(true);
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void load(false); }, 15_000);
    const onVisible = () => { if (document.visibilityState === "visible") void load(false); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [canManage, clientId]);

  const tasksByColumn = useMemo(() => {
    const grouped = new Map<ClientTaskBoardColumnId, AgencyTask[]>();
    for (const task of tasks ?? []) {
      if (!task.clientBoardColumn) continue;
      const rows = grouped.get(task.clientBoardColumn) ?? [];
      rows.push(task);
      grouped.set(task.clientBoardColumn, rows);
    }
    for (const rows of grouped.values()) rows.sort((left, right) => (left.clientBoardOrder ?? left.createdAt) - (right.clientBoardOrder ?? right.createdAt));
    return grouped;
  }, [tasks]);

  const waitingCount = tasksByColumn.get(WAITING_COLUMN_ID)?.length ?? 0;

  useEffect(() => {
    onWaitingCount?.(waitingCount);
  }, [waitingCount, onWaitingCount]);

  async function refresh() {
    setBusy("refresh");
    try {
      await applyResponse(await fetch(`/api/tenants/client-tasks?clientId=${encodeURIComponent(clientId)}`, { cache: "no-store" }));
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "The shared task board could not be refreshed.");
    } finally {
      setBusy(null);
    }
  }

  async function quickAdd() {
    if (!canManage || !draft.trim()) return;
    const requestId = draftOperationId ?? operationId();
    setDraftOperationId(requestId);
    setBusy("create");
    try {
      await applyResponse(await fetch("/api/tenants/client-tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, action: "create", title: draft, operationId: requestId }),
      }));
      setDraft("");
      setDraftOperationId(null);
      setError(null);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "The task could not be created.");
    } finally {
      setBusy(null);
    }
  }

  async function moveTask(task: AgencyTask, columnId: ClientTaskBoardColumnId, index: number) {
    if (!canManage || task.clientBoardColumn === columnId) return;
    setBusy(task.id);
    try {
      await applyResponse(await fetch("/api/tenants/client-tasks", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, id: task.id, columnId, order: Date.now() + index, expectedRevision: task.revision ?? 0 }),
      }));
      setError(null);
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "The task could not be moved.");
    } finally {
      setBusy(null);
    }
  }

  async function removeTask(task: AgencyTask) {
    if (!canManage || !window.confirm(`Delete “${task.title}” from the shared Actions board?`)) return;
    setBusy(task.id);
    try {
      const query = new URLSearchParams({ clientId, id: task.id, expectedRevision: String(task.revision ?? 0) });
      await applyResponse(await fetch(`/api/tenants/client-tasks?${query}`, { method: "DELETE" }));
      setError(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "The task could not be deleted.");
    } finally {
      setBusy(null);
    }
  }

  if (tasks === null) return <p className="text-sm text-black/55">Loading shared Actions board…</p>;

  return (
    <div className="flex flex-col gap-3" data-testid="client-tasks-kanban">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-medium text-black/90">{clientName} tasks</h2>
          <p className="mt-1 text-[11px] text-black/45">Shared with permitted operators through the canonical Actions task ledger.</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-black/55">
          {waitingCount > 0 ? <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900">{waitingCount} waiting on client</span> : null}
          <Link href="/portal/agency/actions" className="font-semibold text-[#087f8c]">Open Actions</Link>
          <button type="button" onClick={() => void refresh()} disabled={busy !== null} title="Refresh shared board" className="grid size-8 place-items-center rounded-md border border-black/10 disabled:opacity-40"><RefreshCw size={13} className={busy === "refresh" ? "animate-spin" : ""} /></button>
          {!canManage ? <span className="rounded-full bg-black/5 px-2 py-0.5">Read-only</span> : null}
        </div>
      </div>

      {error ? <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">{error}</p> : null}

      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
        {CLIENT_TASK_BOARD_COLUMNS.map(column => {
          const isWaiting = column.id === WAITING_COLUMN_ID;
          const isBacklog = column.id === "backlog";
          const columnTasks = tasksByColumn.get(column.id) ?? [];
          return (
            <section
              key={column.id}
              data-column={column.label}
              data-testid={`kanban-col-${column.id}`}
              className={`flex w-64 shrink-0 flex-col rounded-lg border p-2 ${isWaiting ? "border-amber-300 bg-amber-50/60" : "border-black/10 bg-black/[0.02]"}`}
              onDragOver={event => { if (canManage) event.preventDefault(); }}
              onDrop={event => {
                if (!canManage) return;
                event.preventDefault();
                const taskId = event.dataTransfer.getData("text/x-task-id");
                const task = tasks.find(item => item.id === taskId);
                if (task) void moveTask(task, column.id, columnTasks.length);
              }}
            >
              <header className="mb-1 flex items-baseline justify-between px-1">
                <h3 className={`text-[11px] font-semibold uppercase tracking-wide ${isWaiting ? "text-amber-900" : "text-black/55"}`}>{column.label}</h3>
                <span className="text-[10px] text-black/40">{columnTasks.length}</span>
              </header>
              <ul className="flex min-h-[2rem] flex-col gap-1">
                {columnTasks.map(task => (
                  <li key={task.id} draggable={canManage && busy === null} onDragStart={event => { event.dataTransfer.setData("text/x-task-id", task.id); event.dataTransfer.effectAllowed = "move"; }} className="group flex items-start gap-2 rounded-md border border-black/10 bg-white px-2 py-1.5 text-sm text-black/85 shadow-sm hover:bg-black/[0.02]">
                    <span className="min-w-0 flex-1 break-words">{task.title}</span>
                    {canManage ? <button type="button" onClick={() => void removeTask(task)} disabled={busy !== null} aria-label={`Delete ${task.title}`} className="grid size-6 shrink-0 place-items-center rounded text-black/25 opacity-0 hover:bg-red-50 hover:text-red-700 focus:opacity-100 group-hover:opacity-100 disabled:opacity-20"><Trash2 size={12} /></button> : null}
                  </li>
                ))}
              </ul>
              {isBacklog && canManage ? (
                <form className="mt-2 flex items-center gap-1" onSubmit={event => { event.preventDefault(); void quickAdd(); }}>
                  <input type="text" value={draft} disabled={busy !== null} onChange={event => { setDraft(event.target.value); if (!draftOperationId) setDraftOperationId(operationId()); }} placeholder="+ New task" className="flex-1 rounded-md border border-black/15 bg-white px-2 py-1 text-xs placeholder:text-black/35 focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-50" />
                  <button type="submit" disabled={busy !== null || !draft.trim()} className="rounded-md bg-brand px-2 py-1 text-xs font-semibold text-white shadow hover:opacity-90 disabled:opacity-50">Add</button>
                </form>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export const _CLIENT_TASKS_TEMPLATE_COLUMNS = CLIENT_TASK_BOARD_COLUMNS.map(column => column.label);
