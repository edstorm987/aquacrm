// Bookings plugin domain.

import type { ClientId } from "./tenancy";

// 0=Sun … 6=Sat to mirror JavaScript Date.getUTCDay().
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Service {
  id: string;
  agencyId: string;
  clientId: ClientId;
  label: string;
  durationMin: number;
  priceCents?: number;
  // Group sessions: how many bookings can occupy the same slot. v1
  // defaults to 1 (1:1 sessions).
  capacity: number;
  // Buffer after each booking (min) before the next slot becomes
  // available for the same service.
  bufferMin: number;
  color?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CreateServiceInput {
  label: string;
  durationMin: number;
  priceCents?: number;
  capacity?: number;
  bufferMin?: number;
  color?: string;
  active?: boolean;
}

export interface UpdateServicePatch {
  label?: string;
  durationMin?: number;
  priceCents?: number;
  capacity?: number;
  bufferMin?: number;
  color?: string;
  active?: boolean;
}

// Per-weekday open windows expressed as half-open ranges
// `["HH:MM", "HH:MM")` in the agency's local-but-UTC-treated clock
// (we don't carry tz in v1; operator runbook documents the choice).
export interface AvailabilityWindow {
  start: string;
  end: string;
}

export interface Availability {
  agencyId: string;
  clientId: ClientId;
  weekdayPattern: Record<Weekday, AvailabilityWindow[]>;
  // YYYY-MM-DD strings — entire days excluded from slot generation.
  exceptions: string[];
  updatedAt: number;
}

export type BookingStatus =
  | "tentative" | "confirmed" | "cancelled" | "completed" | "no-show";

export interface Booking {
  id: string;
  agencyId: string;
  clientId: ClientId;
  serviceId: string;
  startAt: number;             // epoch ms
  endAt: number;               // epoch ms
  status: BookingStatus;
  endCustomerEmail: string;
  endCustomerName: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreateBookingInput {
  serviceId: string;
  startAt: number;
  endCustomerEmail: string;
  endCustomerName: string;
  notes?: string;
  status?: BookingStatus;
}

export interface BookingFilter {
  serviceId?: string;
  status?: BookingStatus;
  windowStart?: number;
  windowEnd?: number;
}

export interface SlotProposal {
  startAt: number;
  endAt: number;
  remainingCapacity: number;
}

export const STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  tentative: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled", "no-show"],
  cancelled: [],
  completed: [],
  "no-show": ["confirmed"], // operator can mark up if customer turned up late
};

export const TERMINAL_STATUSES: readonly BookingStatus[] =
  ["cancelled", "completed", "no-show"] as const;

export function emptyAvailability(agencyId: string, clientId: ClientId, t: number): Availability {
  return {
    agencyId,
    clientId,
    weekdayPattern: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
    exceptions: [],
    updatedAt: t,
  };
}

export function parseHHMM(s: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, m: min };
}

export function dayKeyUTC(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
