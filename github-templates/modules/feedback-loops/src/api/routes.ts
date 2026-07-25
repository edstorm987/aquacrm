import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  approveTestimonialHandler,
  deleteTestimonialHandler,
  listPulsesHandler,
  listTestimonialsHandler,
  publicTestimonialHandler,
  replyTestimonialHandler,
  requestTestimonialHandler,
  respondPulseHandler,
  sendPulseHandler,
} from "./handlers";

const ADMINS = ["agency-owner", "agency-manager", "agency-staff"] as const;
const VIEWERS = [
  "agency-owner", "agency-manager", "agency-staff",
  "client-owner", "client-staff", "freelancer", "end-customer",
] as const;

export const ROUTES: PluginApiRoute[] = [
  // Pulses
  { path: "pulses",          methods: ["GET"],  handler: listPulsesHandler,    visibleToRoles: [...ADMINS]  },
  { path: "pulses/send",     methods: ["POST"], handler: sendPulseHandler,     visibleToRoles: [...ADMINS]  },
  // Customer-side response — viewers includes end-customer.
  { path: "pulses/respond",  methods: ["POST"], handler: respondPulseHandler,  visibleToRoles: [...VIEWERS] },

  // Testimonials
  { path: "testimonials",          methods: ["GET"],    handler: listTestimonialsHandler,     visibleToRoles: [...ADMINS]  },
  { path: "testimonials/request",  methods: ["POST"],   handler: requestTestimonialHandler,   visibleToRoles: [...ADMINS]  },
  { path: "testimonials/reply",    methods: ["POST"],   handler: replyTestimonialHandler,     visibleToRoles: [...VIEWERS] },
  { path: "testimonials/approve",  methods: ["POST"],   handler: approveTestimonialHandler,   visibleToRoles: [...ADMINS]  },
  { path: "testimonials/public",   methods: ["POST"],   handler: publicTestimonialHandler,    visibleToRoles: [...ADMINS]  },
  { path: "testimonials/delete",   methods: ["DELETE"], handler: deleteTestimonialHandler,    visibleToRoles: [...ADMINS]  },
];
