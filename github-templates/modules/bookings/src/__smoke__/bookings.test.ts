// Bookings plugin smoke. node:test via tsx --test.

import { describe, test } from "node:test";
import { strict as assert } from "node:assert";

import type {
  ActivityEntry,
  AgencyId,
  ClientId,
  UserId,
} from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  CrmPort,
  EmailSenderPort,
  EventBusPort,
} from "../server/ports";
import {
  containerWithDeps,
  buildICS,
} from "../server/index";
import { now, setClock, resetClock } from "../lib/time";

const AGENCY: AgencyId = "agency_aqua";
const CLIENT: ClientId = "client_felicia";
const ACTOR: UserId = "user_admin";
const T0 = Date.UTC(2026, 4, 4, 0, 0, 0); // Mon 2026-05-04
const HOUR_MS = 3_600_000;
const MIN_MS = 60_000;

interface World {
  storage: PluginStorage;
  activity: ActivityLogPort;
  events: EventBusPort;
  inspect: { activityLog: ActivityEntry[]; events: { name: string; payload: unknown }[] };
}

function buildWorld(): World {
  const data = new Map<string, unknown>();
  const activityLog: ActivityEntry[] = [];
  const events: { name: string; payload: unknown }[] = [];
  const storage: PluginStorage = {
    async get<T = unknown>(key: string): Promise<T | undefined> { return data.get(key) as T | undefined; },
    async set<T = unknown>(key: string, value: T): Promise<void> { data.set(key, value); },
    async del(key: string): Promise<void> { data.delete(key); },
    async list(prefix?: string): Promise<string[]> {
      const keys = [...data.keys()];
      return prefix ? keys.filter(k => k.startsWith(prefix)) : keys;
    },
  };
  let actSeq = 1;
  const activity: ActivityLogPort = {
    logActivity(input) {
      const entry: ActivityEntry = {
        id: `act_${String(actSeq++).padStart(4, "0")}`,
        ts: now(),
        agencyId: input.agencyId, clientId: input.clientId,
        actorUserId: input.actorUserId, actorEmail: input.actorEmail,
        category: input.category, action: input.action, message: input.message,
        metadata: input.metadata,
      };
      activityLog.push(entry);
      return entry;
    },
  };
  const eventBus: EventBusPort = {
    emit(_scope, name, payload) { events.push({ name, payload }); },
  };
  return { storage, activity, events: eventBus, inspect: { activityLog, events } };
}

interface ContainerOpts {
  emailSender?: EmailSenderPort | null;
  crm?: CrmPort | null;
}

function container(world: World, opts: ContainerOpts = {}) {
  return containerWithDeps({
    agencyId: AGENCY,
    clientId: CLIENT,
    storage: world.storage,
    activity: world.activity,
    events: world.events,
    emailSender: opts.emailSender ?? null,
    crm: opts.crm ?? null,
  });
}

async function seedAvailability(c: ReturnType<typeof container>) {
  // Open Mon-Fri 9-17.
  await c.bookings.setAvailability({
    weekdayPattern: {
      0: [],
      1: [{ start: "09:00", end: "17:00" }],
      2: [{ start: "09:00", end: "17:00" }],
      3: [{ start: "09:00", end: "17:00" }],
      4: [{ start: "09:00", end: "17:00" }],
      5: [{ start: "09:00", end: "17:00" }],
      6: [],
    },
    exceptions: [],
  });
}

describe("@aqua/plugin-bookings smoke", () => {
  test("1. service CRUD — create + list + update + archive", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const s = await c.bookings.createService(ACTOR, { label: "Therapy 60", durationMin: 60 });
    assert.equal(s.capacity, 1);
    assert.equal(s.bufferMin, 0);
    let list = await c.bookings.listServices();
    assert.equal(list.length, 1);
    const upd = await c.bookings.updateService(ACTOR, s.id, { bufferMin: 15, priceCents: 5000 });
    assert.equal(upd.bufferMin, 15);
    assert.equal(upd.priceCents, 5000);
    await c.bookings.archiveService(ACTOR, s.id);
    list = await c.bookings.listServices(); // active only
    assert.equal(list.length, 0);
    list = await c.bookings.listServices(true);
    assert.equal(list.length, 1);
    assert.equal(list[0]?.active, false);
    resetClock();
  });

  test("2. createService rejects empty label / non-positive duration", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    await assert.rejects(() => c.bookings.createService(ACTOR, { label: "", durationMin: 30 }));
    await assert.rejects(() => c.bookings.createService(ACTOR, { label: "x", durationMin: 0 }));
    resetClock();
  });

  test("3. setAvailability rejects malformed HH:MM windows", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    await assert.rejects(() => c.bookings.setAvailability({
      weekdayPattern: { 0: [], 1: [{ start: "9-00", end: "17:00" }], 2: [], 3: [], 4: [], 5: [], 6: [] },
    }));
    resetClock();
  });

  test("4. slot generation respects weekly windows + exceptions; weekend yields nothing", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const svc = await c.bookings.createService(ACTOR, { label: "T", durationMin: 60 });
    await seedAvailability(c);
    const monday = T0; // 2026-05-04 Mon
    const sunday = T0 - 86_400_000; // 2026-05-03 Sun
    const monSlots = await c.bookings.generateSlots(svc.id, monday, monday + 86_400_000);
    assert.equal(monSlots.length, 8); // 9..17 → 8 hourly slots
    const sunSlots = await c.bookings.generateSlots(svc.id, sunday, sunday + 86_400_000);
    assert.equal(sunSlots.length, 0);

    await c.bookings.setAvailability({ exceptions: ["2026-05-04"] });
    const exMon = await c.bookings.generateSlots(svc.id, monday, monday + 86_400_000);
    assert.equal(exMon.length, 0);
    resetClock();
  });

  test("5. slot generation respects buffer — booking at 10:00 with 30m buffer blocks 09:30..11:30", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const svc = await c.bookings.createService(ACTOR, { label: "T", durationMin: 60, bufferMin: 30 });
    await seedAvailability(c);
    const monday = T0;
    const tenAm = monday + 10 * HOUR_MS;
    await c.bookings.createBooking({
      serviceId: svc.id, startAt: tenAm,
      endCustomerEmail: "x@example.com", endCustomerName: "X",
    });
    const slots = await c.bookings.generateSlots(svc.id, monday, monday + 86_400_000);
    // Without buffer: 8 slots; the 10:00 slot is taken; with buffer
    // the 9:00 (overlaps via end+buffer) and 11:00 (overlaps via
    // start-buffer) are also blocked → 5 free.
    assert.equal(slots.length, 5);
    assert.ok(!slots.some(s => s.startAt === tenAm));
    assert.ok(!slots.some(s => s.startAt === tenAm - HOUR_MS));
    assert.ok(!slots.some(s => s.startAt === tenAm + HOUR_MS));
    resetClock();
  });

  test("6. capacity > 1 — group session shares the same start; slot reports remainingCapacity", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const svc = await c.bookings.createService(ACTOR, { label: "Group", durationMin: 60, capacity: 3 });
    await seedAvailability(c);
    const tenAm = T0 + 10 * HOUR_MS;
    await c.bookings.createBooking({ serviceId: svc.id, startAt: tenAm,
      endCustomerEmail: "a@example.com", endCustomerName: "A" });
    await c.bookings.createBooking({ serviceId: svc.id, startAt: tenAm,
      endCustomerEmail: "b@example.com", endCustomerName: "B" });
    const slots = await c.bookings.generateSlots(svc.id, T0, T0 + 86_400_000);
    const ten = slots.find(s => s.startAt === tenAm);
    assert.ok(ten);
    assert.equal(ten!.remainingCapacity, 1);

    await c.bookings.createBooking({ serviceId: svc.id, startAt: tenAm,
      endCustomerEmail: "c@example.com", endCustomerName: "C" });
    await assert.rejects(
      () => c.bookings.createBooking({ serviceId: svc.id, startAt: tenAm,
        endCustomerEmail: "d@example.com", endCustomerName: "D" }),
      /slot full/,
    );
    resetClock();
  });

  test("7. createBooking is idempotent on (serviceId, startAt, email) — repeat returns deduped:true", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const svc = await c.bookings.createService(ACTOR, { label: "T", durationMin: 60 });
    await seedAvailability(c);
    const tenAm = T0 + 10 * HOUR_MS;
    const first = await c.bookings.createBooking({
      serviceId: svc.id, startAt: tenAm,
      endCustomerEmail: "Me@Example.COM", endCustomerName: "Me",
    });
    assert.equal(first.deduped, false);
    const again = await c.bookings.createBooking({
      serviceId: svc.id, startAt: tenAm,
      endCustomerEmail: "me@example.com", endCustomerName: "Me",
    });
    assert.equal(again.deduped, true);
    assert.equal(again.booking.id, first.booking.id);
    const list = await c.bookings.listBookings();
    assert.equal(list.length, 1);
    resetClock();
  });

  test("8. createBooking rejects taken slot (capacity 1) with BookingConflictError", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const svc = await c.bookings.createService(ACTOR, { label: "T", durationMin: 60 });
    await seedAvailability(c);
    const tenAm = T0 + 10 * HOUR_MS;
    await c.bookings.createBooking({
      serviceId: svc.id, startAt: tenAm,
      endCustomerEmail: "a@example.com", endCustomerName: "A",
    });
    await assert.rejects(
      () => c.bookings.createBooking({
        serviceId: svc.id, startAt: tenAm,
        endCustomerEmail: "b@example.com", endCustomerName: "B",
      }),
      /slot taken/,
    );
    resetClock();
  });

  test("9. status transitions follow STATUS_TRANSITIONS — tentative→confirmed→completed; invalid throws", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const c = container(world);
    const svc = await c.bookings.createService(ACTOR, { label: "T", durationMin: 60 });
    await seedAvailability(c);
    const tenAm = T0 + 10 * HOUR_MS;
    const { booking } = await c.bookings.createBooking({
      serviceId: svc.id, startAt: tenAm,
      endCustomerEmail: "x@example.com", endCustomerName: "X",
    });
    assert.equal(booking.status, "tentative");
    const confirmed = await c.bookings.transition(ACTOR, booking.id, "confirmed");
    assert.equal(confirmed.status, "confirmed");
    const completed = await c.bookings.transition(ACTOR, booking.id, "completed");
    assert.equal(completed.status, "completed");
    await assert.rejects(() => c.bookings.transition(ACTOR, booking.id, "cancelled"));
    resetClock();
  });

  test("10. completed transition merges to CRM via mergeFromBooking when port present", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const merges: { email: string; name: string; bookingId: string }[] = [];
    const crm: CrmPort = {
      mergeFromBooking({ email, name, bookingId }) { merges.push({ email, name, bookingId }); },
    };
    const c = container(world, { crm });
    const svc = await c.bookings.createService(ACTOR, { label: "T", durationMin: 60 });
    await seedAvailability(c);
    const { booking } = await c.bookings.createBooking({
      serviceId: svc.id, startAt: T0 + 10 * HOUR_MS,
      endCustomerEmail: "merged@example.com", endCustomerName: "Merged",
    });
    await c.bookings.transition(ACTOR, booking.id, "confirmed");
    await c.bookings.transition(ACTOR, booking.id, "completed");
    assert.equal(merges.length, 1);
    assert.equal(merges[0]?.email, "merged@example.com");
    assert.equal(merges[0]?.bookingId, booking.id);
    resetClock();
  });

  test("11. createBooking enqueues confirmation email with ICS attachment when emailSender installed", async () => {
    setClock(() => T0);
    const world = buildWorld();
    const sent: Array<{ to: string; subject: string; attachments?: unknown }> = [];
    const emailSender: EmailSenderPort = {
      send({ to, subject, attachments }) {
        sent.push({ to, subject, attachments });
        return { ok: true };
      },
    };
    const c = container(world, { emailSender });
    const svc = await c.bookings.createService(ACTOR, { label: "T", durationMin: 60 });
    await seedAvailability(c);
    await c.bookings.createBooking({
      serviceId: svc.id, startAt: T0 + 10 * HOUR_MS,
      endCustomerEmail: "x@example.com", endCustomerName: "X",
    });
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.to, "x@example.com");
    const atts = sent[0]?.attachments as Array<{ filename: string; body: string }> | undefined;
    assert.ok(atts && atts[0]);
    assert.equal(atts![0]!.filename, "invite.ics");
    assert.match(atts![0]!.body, /^BEGIN:VCALENDAR/);

    // No emailSender — engine must NOT throw.
    const c2 = container(world, { emailSender: null });
    const svc2 = await c2.bookings.createService(ACTOR, { label: "T2", durationMin: 60 });
    await c2.bookings.createBooking({
      serviceId: svc2.id, startAt: T0 + 11 * HOUR_MS,
      endCustomerEmail: "y@example.com", endCustomerName: "Y",
    });
    resetClock();
  });

  test("12. ICS builder — folds long lines, escapes ;,\\\\\\n, RFC-5545 minimum fields present", () => {
    setClock(() => T0);
    const ics = buildICS({
      uid: "abc@host",
      summary: "Therapy; with, commas \\and\nnewlines",
      startAt: T0,
      endAt: T0 + 60 * MIN_MS,
    });
    assert.match(ics, /BEGIN:VCALENDAR/);
    assert.match(ics, /END:VCALENDAR/);
    assert.match(ics, /UID:abc@host/);
    assert.match(ics, /SUMMARY:Therapy\\;/);
    assert.match(ics, /\\n/);
    // Folded continuation lines start with single space.
    const long = buildICS({
      uid: "u",
      summary: "x".repeat(200),
      startAt: T0, endAt: T0 + MIN_MS,
    });
    assert.ok(long.split("\r\n").some(l => l.startsWith(" ")));
    resetClock();
  });
});

resetClock();
