export {
  PulseService,
  TestimonialService,
  FeedbackNotFoundError,
  InvalidTestimonialTransitionError,
} from "./services";
export {
  DETRACTOR_CUTOFF,
  PROMOTER_CUTOFF,
  TESTIMONIAL_STATUSES,
  TESTIMONIAL_TRANSITIONS,
} from "../lib/domain";
export type {
  ActivityLogPort, EventBusPort,
  FeedbackEventName, LogActivityInput, StoragePort, TenantPort, UserPort,
} from "./ports";
export {
  registerFeedbackFoundation,
  clearFeedbackFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { FeedbackFoundation, ContainerForArgs } from "./foundationAdapter";

import type { AgencyId, ClientId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";
import { PulseService, TestimonialService } from "./services";

export interface FeedbackDepsInput {
  agencyId: AgencyId;
  clientId: ClientId;
  storage: PluginStorage | StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
}

export interface FeedbackContainer {
  pulses: PulseService;
  testimonials: TestimonialService;
}

export function buildFeedbackContainer(deps: FeedbackDepsInput): FeedbackContainer {
  const storage = deps.storage as StoragePort;
  const pulses = new PulseService({
    agencyId: deps.agencyId, clientId: deps.clientId,
    storage, activity: deps.activity, events: deps.events,
  });
  const testimonials = new TestimonialService({
    agencyId: deps.agencyId, clientId: deps.clientId,
    storage, activity: deps.activity, events: deps.events,
  });
  return { pulses, testimonials };
}
