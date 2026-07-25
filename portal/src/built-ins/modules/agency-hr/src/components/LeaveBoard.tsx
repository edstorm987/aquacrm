"use client";

import { useMemo, useState } from "react";

import type { LeaveRequest, LeaveStatus, LeaveType, Staff } from "../lib/domain";

export interface LeaveBoardProps {
  leave: LeaveRequest[];
  staff: Staff[];
  apiBase: string;
  canDecide: boolean;
  actor: string;
}

const STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const TYPE_LABEL: Record<LeaveType, string> = {
  pto: "PTO",
  sick: "Sick",
  sabbatical: "Sabbatical",
};

export function LeaveBoard({ leave, staff, apiBase, canDecide, actor }: LeaveBoardProps) {
  const [filter, setFilter] = useState<LeaveStatus | "all">("pending");
  const [showRequestForm, setShowRequestForm] = useState(false);

  const byStatus = useMemo(() => filter === "all" ? leave : leave.filter(l => l.status === filter), [leave, filter]);
  const staffById = useMemo(() => new Map(staff.map(s => [s.id, s])), [staff]);

  return (
    <section className="hr-leave">
      <header className="hr-list-header">
        <div>
          <h1>Leave requests</h1>
          <p>{leave.length === 0 ? "No requests on the books." : `${byStatus.length} of ${leave.length} matching.`}</p>
        </div>
        <div className="hr-list-actions">
          <select value={filter} onChange={e => setFilter(e.target.value as LeaveStatus | "all")}>
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <button type="button" onClick={() => setShowRequestForm(s => !s)}>+ New request</button>
        </div>
      </header>

      {showRequestForm && (
        <NewLeaveForm apiBase={apiBase} staff={staff} onCancel={() => setShowRequestForm(false)} />
      )}

      <ul className="hr-leave-grid">
        {byStatus.map(l => {
          const member = staffById.get(l.staffId);
          return (
            <li key={l.id}>
              <article className="hr-leave-card">
                <header>
                  <h3>{member?.name ?? "Unknown staff"}</h3>
                  <span className={`hr-pill hr-pill-leave-${l.status}`}>{STATUS_LABEL[l.status]}</span>
                </header>
                <p className="hr-staff-meta">{TYPE_LABEL[l.type]} · {l.days} day{l.days === 1 ? "" : "s"}</p>
                <p className="hr-staff-meta">{l.startDate} → {l.endDate}</p>
                {l.reason && <p className="hr-leave-reason">"{l.reason}"</p>}
                {l.decisionNote && <p className="hr-leave-decision">Decision: {l.decisionNote}</p>}
                {canDecide && l.status === "pending" && (
                  <div className="hr-leave-actions">
                    <DecideButton apiBase={apiBase} leaveId={l.id} approvedBy={actor} status="approved" label="Approve" />
                    <DecideButton apiBase={apiBase} leaveId={l.id} approvedBy={actor} status="rejected" label="Reject" />
                  </div>
                )}
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function NewLeaveForm({ apiBase, staff, onCancel }: { apiBase: string; staff: Staff[]; onCancel: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="hr-leave-create"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        const body = {
          staffId: String(fd.get("staffId") ?? ""),
          type: String(fd.get("type") ?? "pto") as LeaveType,
          startDate: String(fd.get("startDate") ?? ""),
          endDate: String(fd.get("endDate") ?? ""),
          reason: String(fd.get("reason") ?? "").trim() || undefined,
        };
        if (!body.staffId || !body.startDate || !body.endDate) {
          setError("staffId, startDate, endDate required.");
          return;
        }
        setBusy(true);
        try {
          const r = await fetch(`${apiBase}/leave`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
          const data = await r.json();
          if (!r.ok || !data.ok) {
            setError(data?.error ?? `Failed (${r.status})`);
            return;
          }
          window.location.reload();
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>Request leave</h3>
      <label>Staff
        <select name="staffId" required defaultValue="">
          <option value="" disabled>Select…</option>
          {staff.filter(s => s.status !== "alumni").map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>
      <label>Type
        <select name="type" defaultValue="pto">
          <option value="pto">PTO</option>
          <option value="sick">Sick</option>
          <option value="sabbatical">Sabbatical</option>
        </select>
      </label>
      <label>Start<input name="startDate" type="date" required /></label>
      <label>End<input name="endDate" type="date" required /></label>
      <label>Reason<textarea name="reason" rows={3} /></label>
      {error && <p className="hr-form-error">{error}</p>}
      <footer>
        <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit"}</button>
      </footer>
    </form>
  );
}

function DecideButton(props: { apiBase: string; leaveId: string; approvedBy: string; status: "approved" | "rejected"; label: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch(`${props.apiBase}/leave/decide`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: props.leaveId, status: props.status, approvedBy: props.approvedBy }),
          });
          window.location.reload();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "…" : props.label}
    </button>
  );
}
