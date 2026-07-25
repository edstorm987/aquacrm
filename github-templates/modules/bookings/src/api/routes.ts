import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  archiveServiceHandler,
  createBookingHandler,
  createServiceHandler,
  getAvailabilityHandler,
  listBookingsHandler,
  listServicesHandler,
  setAvailabilityHandler,
  slotsHandler,
  transitionBookingHandler,
  updateServiceHandler,
} from "./handlers";

const ADMINS = ["agency-owner", "agency-manager", "client-owner"] as const;
const VIEWERS = ["agency-owner", "agency-manager", "agency-staff", "client-owner", "client-staff"] as const;

export const ROUTES: PluginApiRoute[] = [
  // Services
  { path: "services",         methods: ["GET"],    handler: listServicesHandler,    visibleToRoles: [...VIEWERS] },
  { path: "services/create",  methods: ["POST"],   handler: createServiceHandler,   visibleToRoles: [...ADMINS] },
  { path: "services/update",  methods: ["PATCH"],  handler: updateServiceHandler,   visibleToRoles: [...ADMINS] },
  { path: "services/archive", methods: ["DELETE"], handler: archiveServiceHandler,  visibleToRoles: [...ADMINS] },

  // Availability
  { path: "availability",      methods: ["GET"],   handler: getAvailabilityHandler, visibleToRoles: [...VIEWERS] },
  { path: "availability/save", methods: ["PATCH"], handler: setAvailabilityHandler, visibleToRoles: [...ADMINS] },

  // Slots + Bookings
  { path: "slots",            methods: ["GET"],    handler: slotsHandler,           public: true },
  { path: "bookings",         methods: ["GET"],    handler: listBookingsHandler,    visibleToRoles: [...VIEWERS] },
  { path: "bookings/create",  methods: ["POST"],   handler: createBookingHandler,   public: true },
  { path: "bookings/transition", methods: ["POST"], handler: transitionBookingHandler, visibleToRoles: [...ADMINS] },
];
