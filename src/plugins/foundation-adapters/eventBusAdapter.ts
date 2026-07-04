import "server-only";
import { emit } from "@/server/eventBus";
import type { EventBusPort, EventName } from "@/plugins/_types";
import type { AquaEventName } from "@/server/eventBus";

// EventBusPort.EventName is a superset of AquaEventName (T2 declared
// some forward-looking names like brief.created that aren't yet in T1's
// canonical union). Cast via the intersection — events outside the
// canonical union still go onto the bus, just typed at the wider port.
export const eventBusAdapter: EventBusPort = {
  emit<T = unknown>(scope: { agencyId: string; clientId?: string }, name: EventName, payload: T) {
    emit(scope, name as AquaEventName, payload);
  },
};
