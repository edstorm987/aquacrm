"use client";

import type { ChecklistViewItem } from "../server";

export interface ChecklistTaskProps {
  task: ChecklistViewItem;
  // Whether this list is editable from this surface. Internal column on
  // the agency phase board: editable. Client column on the agency phase
  // board: read-only (display progress only). Client checklist page: editable.
  editable: boolean;
  onToggle?: (next: boolean) => void;
  busy?: boolean;
}

export function ChecklistTask(props: ChecklistTaskProps) {
  const { task, editable, onToggle, busy } = props;
  return (
    <li
      className="fulfillment-task"
      data-done={task.done ? "true" : "false"}
      data-visibility={task.visibility}
    >
      <label className="fulfillment-task-row">
        <input
          type="checkbox"
          checked={task.done}
          disabled={!editable || busy}
          onChange={editable ? (e) => onToggle?.(e.target.checked) : undefined}
          aria-label={task.label}
        />
        <span className="fulfillment-task-label">{task.label}</span>
        {task.done && task.doneAt && (
          <span className="fulfillment-task-meta">
            {new Date(task.doneAt).toLocaleDateString()}
          </span>
        )}
      </label>
      {task.notes && <p className="fulfillment-task-notes">{task.notes}</p>}
    </li>
  );
}
