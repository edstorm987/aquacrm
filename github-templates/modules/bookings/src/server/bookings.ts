// BookingsService — services CRUD + availability + slot generation +
// booking lifecycle.
//
// Storage layout (per-install, client-scoped):
//   services/index               → string[] of service ids
//   services/by-id/<id>          → Service
//   availability                 → Availability
//   bookings/index               → string[] of booking ids
//   bookings/by-id/<id>          → Booking
//
// scopePolicy: "client" — every install has both agencyId + clientId.

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type {
  Availability,
  AvailabilityWindow,
  Booking,
  BookingFilter,
  BookingStatus,
  CreateBookingInput,
  CreateServiceInput,
  Service,
  SlotProposal,
  UpdateServicePatch,
  Weekday,
} from "../lib/domain";
import {
  STATUS_TRANSITIONS,
  TERMINAL_STATUSES,
  dayKeyUTC,
  emptyAvailability,
  parseHHMM,
} from "../lib/domain";
import type {
  ActivityLogPort,
  CrmPort,
  EmailSenderPort,
  EventBusPort,
  StoragePort,
} from "./ports";
import { buildICS } from "./ics";

const SERVICES_INDEX = "services/index";
const BOOKINGS_INDEX = "bookings/index";
const AVAILABILITY_KEY = "availability";
const serviceKey = (id: string): string => `services/by-id/${id}`;
const bookingKey = (id: string): string => `bookings/by-id/${id}`;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MIN_MS = 60_000;

export class BookingConflictError extends Error {
  constructor(message: string) { super(message); this.name = "BookingConflictError"; }
}
export class BookingNotFoundError extends Error {
  constructor(message = "bookings: not found") { super(message); this.name = "BookingNotFoundError"; }
}

export interface BookingsDeps {
  agencyId: AgencyId;
  clientId: ClientId;
  storage: StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  emailSender?: EmailSenderPort | null;
  crm?: CrmPort | null;
}

export class BookingsService {
  private readonly agencyId: AgencyId;
  private readonly clientId: ClientId;
  private readonly storage: StoragePort;
  private readonly activity: ActivityLogPort;
  private readonly events: EventBusPort;
  private readonly emailSender: EmailSenderPort | null;
  private readonly crm: CrmPort | null;

  constructor(deps: BookingsDeps) {
    this.agencyId = deps.agencyId;
    this.clientId = deps.clientId;
    this.storage = deps.storage;
    this.activity = deps.activity;
    this.events = deps.events;
    this.emailSender = deps.emailSender ?? null;
    this.crm = deps.crm ?? null;
  }

  // ── Services ──────────────────────────────────────────────────

  async listServices(includeInactive = false): Promise<Service[]> {
    const ids = (await this.storage.get<string[]>(SERVICES_INDEX)) ?? [];
    const out: Service[] = [];
    for (const id of ids) {
      const s = await this.storage.get<Service>(serviceKey(id));
      if (!s) continue;
      if (!includeInactive && !s.active) continue;
      out.push(s);
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }

  async getService(id: string): Promise<Service | null> {
    return (await this.storage.get<Service>(serviceKey(id))) ?? null;
  }

  async createService(actor: UserId, input: CreateServiceInput): Promise<Service> {
    if (!input.label.trim()) throw new Error("bookings: label required");
    if (input.durationMin <= 0) throw new Error("bookings: durationMin must be > 0");
    const t = now();
    const svc: Service = {
      id: makeId("svc"),
      agencyId: this.agencyId,
      clientId: this.clientId,
      label: input.label.trim(),
      durationMin: input.durationMin,
      priceCents: input.priceCents,
      capacity: input.capacity ?? 1,
      bufferMin: input.bufferMin ?? 0,
      color: input.color,
      active: input.active ?? true,
      createdAt: t,
      updatedAt: t,
    };
    await this.storage.set(serviceKey(svc.id), svc);
    const ids = (await this.storage.get<string[]>(SERVICES_INDEX)) ?? [];
    if (!ids.includes(svc.id)) await this.storage.set(SERVICES_INDEX, [...ids, svc.id]);
    this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "settings", action: "bookings.service.created",
      message: `Service "${svc.label}" created (${svc.durationMin}m)`,
      metadata: { serviceId: svc.id },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "bookings.service.created", { id: svc.id });
    return svc;
  }

  async updateService(actor: UserId, id: string, patch: UpdateServicePatch): Promise<Service> {
    const svc = await this.getService(id);
    if (!svc) throw new BookingNotFoundError("bookings: service not found");
    const next: Service = {
      ...svc,
      label: patch.label?.trim() || svc.label,
      durationMin: patch.durationMin ?? svc.durationMin,
      priceCents: patch.priceCents ?? svc.priceCents,
      capacity: patch.capacity ?? svc.capacity,
      bufferMin: patch.bufferMin ?? svc.bufferMin,
      color: patch.color ?? svc.color,
      active: patch.active ?? svc.active,
      updatedAt: now(),
    };
    if (next.durationMin <= 0) throw new Error("bookings: durationMin must be > 0");
    await this.storage.set(serviceKey(id), next);
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "bookings.service.updated", { id });
    return next;
  }

  async archiveService(actor: UserId, id: string): Promise<void> {
    const svc = await this.getService(id);
    if (!svc) throw new BookingNotFoundError("bookings: service not found");
    await this.storage.set(serviceKey(id), { ...svc, active: false, updatedAt: now() });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "bookings.service.archived", { id });
  }

  // ── Availability ──────────────────────────────────────────────

  async getAvailability(): Promise<Availability> {
    const a = await this.storage.get<Availability>(AVAILABILITY_KEY);
    return a ?? emptyAvailability(this.agencyId, this.clientId, now());
  }

  async setAvailability(patch: Partial<Pick<Availability, "weekdayPattern" | "exceptions">>): Promise<Availability> {
    const cur = await this.getAvailability();
    if (patch.weekdayPattern) {
      for (const k of Object.keys(patch.weekdayPattern) as unknown as Weekday[]) {
        for (const w of (patch.weekdayPattern[k] ?? [])) {
          if (!parseHHMM(w.start) || !parseHHMM(w.end)) {
            throw new Error("bookings: window times must be HH:MM");
          }
        }
      }
    }
    const next: Availability = {
      ...cur,
      weekdayPattern: patch.weekdayPattern ?? cur.weekdayPattern,
      exceptions: patch.exceptions ?? cur.exceptions,
      updatedAt: now(),
    };
    await this.storage.set(AVAILABILITY_KEY, next);
    return next;
  }

  // ── Slot generation ───────────────────────────────────────────

  // Returns proposed slots for `service` between [windowStart, windowEnd),
  // honouring availability windows, exceptions, buffer, and existing
  // bookings against the same service. Capacity > 1 surfaces remaining
  // seats; slots with 0 remaining are dropped.
  async generateSlots(serviceId: string, windowStart: number, windowEnd: number): Promise<SlotProposal[]> {
    const svc = await this.getService(serviceId);
    if (!svc) throw new BookingNotFoundError("bookings: service not found");
    if (windowEnd <= windowStart) return [];
    const availability = await this.getAvailability();
    const existing = await this.listBookings({ serviceId, windowStart, windowEnd });
    const liveExisting = existing.filter(b => !TERMINAL_STATUSES.includes(b.status) || b.status === "completed" ? false : true)
      // Booked seats: tentative + confirmed take a seat. Cancelled / no-show free up. Completed already past.
      ;
    // Re-derive "occupies a seat" filter explicitly for clarity:
    const occupyingExisting = existing.filter(
      b => b.status === "tentative" || b.status === "confirmed",
    );
    void liveExisting;

    const slots: SlotProposal[] = [];
    const dur = svc.durationMin * MIN_MS;
    const bufMs = svc.bufferMin * MIN_MS;
    const stride = Math.max(MIN_MS, dur);

    // Iterate day-by-day across the window.
    const startDay = Math.floor(windowStart / DAY_MS) * DAY_MS;
    for (let dayStart = startDay; dayStart < windowEnd; dayStart += DAY_MS) {
      const dayKey = dayKeyUTC(dayStart);
      if (availability.exceptions.includes(dayKey)) continue;
      const wd = (new Date(dayStart).getUTCDay()) as Weekday;
      const windows = availability.weekdayPattern[wd] ?? [];
      for (const w of windows) {
        const startHM = parseHHMM(w.start);
        const endHM = parseHHMM(w.end);
        if (!startHM || !endHM) continue;
        const winStart = dayStart + startHM.h * HOUR_MS + startHM.m * MIN_MS;
        const winEnd = dayStart + endHM.h * HOUR_MS + endHM.m * MIN_MS;
        for (let s = winStart; s + dur <= winEnd; s += stride) {
          const slotEnd = s + dur;
          if (slotEnd <= windowStart) continue;
          if (s >= windowEnd) break;
          // Buffer: occupied bookings carve out [b.startAt - bufMs, b.endAt + bufMs).
          let occupied = 0;
          let conflicts = false;
          for (const b of occupyingExisting) {
            const bStart = b.startAt - bufMs;
            const bEnd = b.endAt + bufMs;
            if (s < bEnd && slotEnd > bStart) {
              // Time overlaps. Treat as a seat hit. Group sessions
              // (capacity > 1) only fully block when start aligns.
              if (svc.capacity <= 1) {
                conflicts = true;
                break;
              }
              if (b.startAt === s) {
                occupied++;
              } else {
                conflicts = true;
                break;
              }
            }
          }
          if (conflicts) continue;
          const remaining = svc.capacity - occupied;
          if (remaining <= 0) continue;
          slots.push({ startAt: s, endAt: slotEnd, remainingCapacity: remaining });
        }
      }
    }
    return slots;
  }

  // ── Bookings ──────────────────────────────────────────────────

  async listBookings(filter: BookingFilter = {}): Promise<Booking[]> {
    const ids = (await this.storage.get<string[]>(BOOKINGS_INDEX)) ?? [];
    const out: Booking[] = [];
    for (const id of ids) {
      const b = await this.storage.get<Booking>(bookingKey(id));
      if (!b) continue;
      if (filter.serviceId && b.serviceId !== filter.serviceId) continue;
      if (filter.status && b.status !== filter.status) continue;
      if (filter.windowStart !== undefined && b.endAt <= filter.windowStart) continue;
      if (filter.windowEnd !== undefined && b.startAt >= filter.windowEnd) continue;
      out.push(b);
    }
    return out.sort((a, b) => a.startAt - b.startAt);
  }

  async getBooking(id: string): Promise<Booking | null> {
    return (await this.storage.get<Booking>(bookingKey(id))) ?? null;
  }

  // Idempotent on (serviceId, startAt, endCustomerEmail) — calling
  // this twice with identical args returns the same booking record
  // rather than a duplicate.
  async createBooking(input: CreateBookingInput): Promise<{ booking: Booking; deduped: boolean }> {
    const svc = await this.getService(input.serviceId);
    if (!svc || !svc.active) throw new BookingNotFoundError("bookings: service not found");
    const email = input.endCustomerEmail.trim().toLowerCase();
    if (!email.includes("@")) throw new Error("bookings: valid endCustomerEmail required");
    if (!input.endCustomerName.trim()) throw new Error("bookings: endCustomerName required");
    const startAt = input.startAt;
    const endAt = startAt + svc.durationMin * MIN_MS;

    // Idempotency check.
    const existing = await this.listBookings({ serviceId: input.serviceId });
    const dupe = existing.find(
      b => b.startAt === startAt && b.endCustomerEmail === email && !TERMINAL_STATUSES.includes(b.status),
    );
    if (dupe) return { booking: dupe, deduped: true };

    // Capacity / overlap check.
    const overlap = existing.filter(
      b => (b.status === "tentative" || b.status === "confirmed") &&
           startAt < b.endAt + svc.bufferMin * MIN_MS &&
           endAt > b.startAt - svc.bufferMin * MIN_MS,
    );
    const sameStart = overlap.filter(b => b.startAt === startAt).length;
    if (svc.capacity <= 1 && overlap.length > 0) {
      throw new BookingConflictError("bookings: slot taken");
    }
    if (svc.capacity > 1 && sameStart >= svc.capacity) {
      throw new BookingConflictError("bookings: slot full");
    }
    if (svc.capacity > 1 && overlap.some(b => b.startAt !== startAt)) {
      throw new BookingConflictError("bookings: overlapping non-aligned slot");
    }

    const t = now();
    const booking: Booking = {
      id: makeId("bk"),
      agencyId: this.agencyId,
      clientId: this.clientId,
      serviceId: input.serviceId,
      startAt, endAt,
      status: input.status ?? "tentative",
      endCustomerEmail: email,
      endCustomerName: input.endCustomerName.trim(),
      notes: input.notes,
      createdAt: t,
      updatedAt: t,
    };
    await this.storage.set(bookingKey(booking.id), booking);
    const ids = (await this.storage.get<string[]>(BOOKINGS_INDEX)) ?? [];
    if (!ids.includes(booking.id)) await this.storage.set(BOOKINGS_INDEX, [...ids, booking.id]);

    this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId,
      category: "settings", action: "bookings.booking.created",
      message: `Booking ${booking.id} for ${svc.label} at ${new Date(startAt).toISOString()} (${booking.endCustomerEmail})`,
      metadata: { bookingId: booking.id, serviceId: svc.id },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "bookings.booking.created", { id: booking.id });

    await this.maybeSendConfirmation(booking, svc);
    return { booking, deduped: false };
  }

  async transition(actor: UserId, id: string, next: BookingStatus): Promise<Booking> {
    const b = await this.getBooking(id);
    if (!b) throw new BookingNotFoundError();
    const allowed = STATUS_TRANSITIONS[b.status];
    if (!allowed.includes(next)) {
      throw new Error(`bookings: cannot transition ${b.status} → ${next}`);
    }
    const updated: Booking = { ...b, status: next, updatedAt: now() };
    await this.storage.set(bookingKey(id), updated);

    const eventName = `bookings.booking.${next === "no-show" ? "no_show" : next}`;
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId }, eventName, { id });
    this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "settings", action: `bookings.booking.${next}`,
      message: `Booking ${id} → ${next}`,
      metadata: { bookingId: id, prev: b.status },
    });

    if (next === "completed" && this.crm) {
      await this.crm.mergeFromBooking({
        agencyId: this.agencyId, clientId: this.clientId,
        email: b.endCustomerEmail, name: b.endCustomerName, bookingId: b.id,
      });
    }
    return updated;
  }

  // ── Email confirmation (graceful no-op when email-sender absent) ──

  private async maybeSendConfirmation(booking: Booking, svc: Service): Promise<void> {
    if (!this.emailSender) return;
    const ics = buildICS({
      uid: `${booking.id}@aqua.bookings`,
      summary: svc.label,
      description: booking.notes,
      startAt: booking.startAt,
      endAt: booking.endAt,
    });
    const body =
      `Hi ${booking.endCustomerName},\n\n` +
      `Your booking for ${svc.label} is confirmed for ${new Date(booking.startAt).toISOString()}.\n\n` +
      `If you need to reschedule, reply to this email.`;
    try {
      await this.emailSender.send({
        agencyId: this.agencyId,
        clientId: this.clientId,
        to: booking.endCustomerEmail,
        subject: `Booking confirmed — ${svc.label}`,
        body,
        attachments: [{ filename: "invite.ics", contentType: "text/calendar", body: ics }],
      });
    } catch {
      // Confirmation failure must not roll back the booking. The
      // notifications plugin will pick up retry semantics.
    }
  }
}
