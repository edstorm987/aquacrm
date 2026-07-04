"use client";

// Booking widget — public-facing storefront block.
// Shows the org's services, lets visitors pick a slot, captures
// name + email, and creates a booking via /api/portal/reservations.
// Three-step flow: pick service → pick slot → enter contact details.

import { useEffect, useState } from "react";
import type { BlockRenderProps } from "../blockRegistry";
import { blockStylesToCss } from "../blockStyles";

interface Service {
  id: string;
  name: string;
  description?: string;
  durationMinutes: number;
  price?: number;
  currency?: string;
  resourceIds: string[];
  staffIds: string[];
}
interface Resource { id: string; name: string }
interface Staff    { id: string; name: string }

type Step = "service" | "slot" | "details" | "confirmed";

export default function BookingWidgetBlock({ block }: BlockRenderProps) {
  const heading = (block.props.heading as string | undefined) ?? "Book an appointment";
  const subheading = (block.props.subheading as string | undefined) ?? "Pick a service and time that works for you.";
  const orgIdProp = (block.props.orgId as string | undefined);
  const showStaff = (block.props.showStaff as boolean | undefined) ?? true;

  const [orgId, setOrgId] = useState<string>(orgIdProp ?? "");
  const [services, setServices] = useState<Service[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [step, setStep] = useState<Step>("service");
  const [pickedService, setPickedService] = useState<Service | null>(null);
  const [pickedDate, setPickedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 1);
    return d;
  });
  const [pickedSlot, setPickedSlot] = useState<{ startMs: number; resourceId: string; staffId?: string } | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [details, setDetails] = useState({ name: "", email: "", phone: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedId, setConfirmedId] = useState<string | null>(null);

  // Resolve orgId from window if not provided.
  useEffect(() => {
    if (orgId) return;
    try {
      const stored = localStorage.getItem("lk_active_org_v1");
      if (stored) setOrgId(stored);
      else setOrgId("agency");
    } catch { setOrgId("agency"); }
  }, [orgId]);

  // Load services + resources + staff once orgId resolved.
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    async function load() {
      try {
        const [s, r, st] = await Promise.all([
          fetch(`/api/portal/reservations/services?orgId=${orgId}`).then(x => x.json()),
          fetch(`/api/portal/reservations/resources?orgId=${orgId}`).then(x => x.json()),
          fetch(`/api/portal/reservations/staff?orgId=${orgId}`).then(x => x.json()),
        ]);
        if (cancelled) return;
        setServices(s.services ?? []);
        setResources(r.resources ?? []);
        setStaff(st.staff ?? []);
      } catch { /* keep empty */ }
    }
    void load();
    return () => { cancelled = true; };
  }, [orgId]);

  function symbol(currency: string): string {
    const c = currency.toUpperCase();
    return c === "GBP" ? "£" : c === "USD" ? "$" : c === "EUR" ? "€" : "";
  }

  // Generate available slots for the picked date based on the
  // service's duration. Simplified — the real availability window
  // and existing-booking exclusion happens server-side; this just
  // shows reasonable candidate times. The server validates on submit.
  function slotsForDate(date: Date, durationMinutes: number): number[] {
    const out: number[] = [];
    const day = new Date(date); day.setHours(9, 0, 0, 0);
    const end = new Date(date); end.setHours(17, 0, 0, 0);
    let cursor = day.getTime();
    // Inner `slotMs` (avoid shadowing the outer `step` state).
    const slotMs = Math.max(15, durationMinutes) * 60_000;
    while (cursor + durationMinutes * 60_000 <= end.getTime()) {
      if (cursor > Date.now() + 60_000) out.push(cursor);
      cursor += slotMs;
    }
    return out;
  }

  function shiftDay(days: number) {
    setPickedDate(d => {
      const next = new Date(d);
      next.setDate(next.getDate() + days);
      return next;
    });
  }

  async function submit() {
    if (!pickedService || !pickedSlot) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/portal/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          resourceId: pickedSlot.resourceId,
          serviceId: pickedService.id,
          staffId: pickedSlot.staffId,
          startMs: pickedSlot.startMs,
          customerName: details.name,
          customerEmail: details.email,
          customerPhone: details.phone || undefined,
          notes: details.notes || undefined,
          source: "storefront",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(humanError(data.error));
        return;
      }
      setConfirmedId(data.booking?.id ?? "ok");
      setStep("confirmed");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  function reset() {
    setStep("service"); setPickedService(null); setPickedSlot(null);
    setSelectedStaffId(""); setDetails({ name: "", email: "", phone: "", notes: "" });
    setConfirmedId(null); setError(null);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (services.length === 0 && step === "service") {
    return (
      <section data-block-type="booking-widget" style={{ padding: "48px 24px", textAlign: "center", ...blockStylesToCss(block.styles) }}>
        <div style={{ maxWidth: 520, margin: "0 auto", opacity: 0.55 }}>
          <p style={{ fontSize: 13 }}>The booking widget will appear here once the operator defines services in the admin.</p>
        </div>
      </section>
    );
  }

  return (
    <section data-block-type="booking-widget" style={{ padding: "64px 24px", ...blockStylesToCss(block.styles) }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <header style={{ textAlign: "center", marginBottom: 32 }}>
          <h2 style={{ fontFamily: "var(--font-playfair, Georgia, serif)", fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
            {heading}
          </h2>
          {subheading && <p style={{ opacity: 0.65, fontSize: 14 }}>{subheading}</p>}
        </header>

        {/* Step indicator */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, fontSize: 11, opacity: 0.6 }}>
          {(["service", "slot", "details", "confirmed"] as Step[]).map((s, i) => (
            <span key={s} style={{
              padding: "4px 10px",
              borderRadius: 999,
              background: step === s ? "var(--brand-accent, #ff6b35)" : "rgba(255,255,255,0.05)",
              color: step === s ? "#fff" : "inherit",
            }}>
              {i + 1}. {s}
            </span>
          ))}
        </div>

        {step === "service" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {services.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => { setPickedService(s); setStep("slot"); }}
                style={{
                  textAlign: "left",
                  padding: 16,
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "inherit",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <p style={{ fontSize: 15, fontWeight: 600 }}>{s.name}</p>
                  <p style={{ fontSize: 13, opacity: 0.65 }}>
                    {s.durationMinutes}min
                    {typeof s.price === "number" && <span> · {symbol(s.currency ?? "GBP")}{(s.price / 100).toFixed(2)}</span>}
                  </p>
                </div>
                {s.description && <p style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>{s.description}</p>}
              </button>
            ))}
          </div>
        )}

        {step === "slot" && pickedService && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <button type="button" onClick={() => shiftDay(-1)} style={btnSecondary}>← Prev</button>
              <p style={{ fontSize: 14, fontWeight: 600 }}>
                {pickedDate.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
              </p>
              <button type="button" onClick={() => shiftDay(1)} style={btnSecondary}>Next →</button>
            </div>

            {showStaff && pickedService.staffIds.length > 1 && (
              <div>
                <p style={{ fontSize: 12, opacity: 0.65, marginBottom: 6 }}>With:</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => setSelectedStaffId("")}
                    style={pillStyle(selectedStaffId === "")}>Any</button>
                  {pickedService.staffIds.map(sid => {
                    const s = staff.find(x => x.id === sid);
                    if (!s) return null;
                    return (
                      <button key={sid} type="button" onClick={() => setSelectedStaffId(sid)} style={pillStyle(selectedStaffId === sid)}>
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 6 }}>
              {slotsForDate(pickedDate, pickedService.durationMinutes).map(ms => {
                const t = new Date(ms);
                const resourceId = pickedService.resourceIds[0] ?? resources[0]?.id;
                if (!resourceId) return null;
                return (
                  <button
                    key={ms}
                    type="button"
                    onClick={() => {
                      setPickedSlot({ startMs: ms, resourceId, staffId: selectedStaffId || undefined });
                      setStep("details");
                    }}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.04)",
                      color: "inherit",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    {t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <button type="button" onClick={() => setStep("service")} style={btnSecondary}>← Change service</button>
            </div>
          </div>
        )}

        {step === "details" && pickedService && pickedSlot && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontSize: 13, opacity: 0.75 }}>
              {pickedService.name} on {new Date(pickedSlot.startMs).toLocaleString()}
            </p>
            <input type="text" placeholder="Your name" value={details.name}
              onChange={e => setDetails({ ...details, name: e.target.value })} required style={inputStyle} />
            <input type="email" placeholder="you@example.com" value={details.email}
              onChange={e => setDetails({ ...details, email: e.target.value })} required style={inputStyle} />
            <input type="tel" placeholder="Phone (optional)" value={details.phone}
              onChange={e => setDetails({ ...details, phone: e.target.value })} style={inputStyle} />
            <textarea placeholder="Notes (optional)" rows={3} value={details.notes}
              onChange={e => setDetails({ ...details, notes: e.target.value })} style={inputStyle} />
            {error && <p style={{ fontSize: 12, color: "#ef4444" }}>{error}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setStep("slot")} style={btnSecondary}>← Back</button>
              <button
                type="button"
                onClick={submit}
                disabled={busy || !details.name || !details.email}
                style={{
                  flex: 1,
                  padding: "10px 18px",
                  borderRadius: 10,
                  background: "var(--brand-accent, #ff6b35)",
                  color: "#fff",
                  fontSize: 14, fontWeight: 600,
                  border: "none",
                  cursor: busy ? "wait" : "pointer",
                  opacity: busy || !details.name || !details.email ? 0.4 : 1,
                }}
              >
                {busy ? "Booking…" : "Confirm booking"}
              </button>
            </div>
          </div>
        )}

        {step === "confirmed" && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <p style={{ fontSize: 48, marginBottom: 16 }}>✓</p>
            <h3 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Booked!</h3>
            <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 16 }}>
              Confirmation sent to <strong>{details.email}</strong>.
            </p>
            <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 24 }}>
              Reference: <code style={{ fontFamily: "var(--font-mono, monospace)" }}>{confirmedId}</code>
            </p>
            <button type="button" onClick={reset} style={btnSecondary}>Book another</button>
          </div>
        )}
      </div>
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.04)",
  color: "inherit",
  fontSize: 14,
};

const btnSecondary: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.03)",
  color: "inherit",
  fontSize: 13,
  cursor: "pointer",
};

function pillStyle(active: boolean): React.CSSProperties {
  return {
    padding: "6px 12px",
    borderRadius: 999,
    border: "1px solid",
    borderColor: active ? "var(--brand-accent, #ff6b35)" : "rgba(255,255,255,0.15)",
    background: active ? "var(--brand-accent, #ff6b35)" : "transparent",
    color: active ? "#fff" : "inherit",
    fontSize: 12,
    cursor: "pointer",
  };
}

function humanError(code: string): string {
  switch (code) {
    case "too-soon":         return "That slot is too close to now — please pick a later time.";
    case "too-far-out":      return "That date is too far in the future.";
    case "no-availability":  return "Sorry, that slot just got taken. Try another.";
    case "staff-busy":       return "That team member is busy then. Try another time or pick Any.";
    case "service-not-found":return "That service is no longer available.";
    case "resource-not-found": return "Setup issue — the operator hasn't linked a resource. Please get in touch.";
    default:                 return "Couldn't book that slot. Try again or pick another time.";
  }
}
