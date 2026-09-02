"use client";

import { useState } from "react";

import type { ChecklistViewItem } from "../server";
import { ChecklistTask } from "./ChecklistTask";
import { mutationErrorMessage } from "@/lib/client/checkedMutation";

export interface ChecklistColumnProps {
  title: string;
  subtitle?: string;
  items: ChecklistViewItem[];
  done: number;
  total: number;
  editable: boolean;
  // The endpoint to POST to when the user ticks an item. Called with
  // `{ itemId, done }`. The component is otherwise stateless.
  onTick?: (args: { itemId: string; done: boolean }) => Promise<void>;
}

export function ChecklistColumn(props: ChecklistColumnProps) {
  const { title, subtitle, items, total, editable, onTick } = props;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const merged = items.map(item => ({
    ...item,
    done: optimistic[item.id] ?? item.done,
  }));
  const mergedDone = merged.filter(i => i.done).length;
  const pct = total > 0 ? Math.round((mergedDone / total) * 100) : 0;

  return (
    <section
      className="fulfillment-checklist-column"
      data-empty={items.length === 0}
      aria-busy={busyId !== null}
    >
      <header>
        <h3>{title}</h3>
        {subtitle && <p className="fulfillment-column-subtitle">{subtitle}</p>}
        <div className="fulfillment-progress">
          <span className="fulfillment-progress-label">
            {mergedDone}/{total} done
          </span>
          <div className="fulfillment-progress-bar" aria-hidden>
            <div className="fulfillment-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </header>
      {error ? (
        <p className="fulfillment-error" role="alert">
          {error} The previous checklist state is still shown; try again.
        </p>
      ) : null}
      {merged.length === 0 ? (
        <p className="fulfillment-empty">No tasks yet.</p>
      ) : (
        <ul className="fulfillment-task-list">
          {merged.map(task => (
            <ChecklistTask
              key={task.id}
              task={task}
              editable={editable}
              busy={busyId !== null}
              onToggle={async (next) => {
                if (!onTick || busyId !== null) return;
                setBusyId(task.id);
                setError(null);
                setOptimistic(o => ({ ...o, [task.id]: next }));
                try {
                  await onTick({ itemId: task.id, done: next });
                } catch (reason) {
                  setError(mutationErrorMessage(reason, "Could not update this checklist item."));
                } finally {
                  // Remove the transient value on both outcomes. A confirmed
                  // parent view is updated before success resolves; failure
                  // therefore reveals the unchanged server-provided value.
                  setOptimistic(o => {
                    const copy = { ...o };
                    delete copy[task.id];
                    return copy;
                  });
                  setBusyId(null);
                }
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
