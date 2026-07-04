import "server-only";
// Internal event bus — typed pub/sub for plugins.
//
// Decouples plugins from each other. Phase engine emits "phase.advanced",
// the fulfillment plugin subscribes; the website-editor plugin subscribes
// to "client.created" to seed a starter portal. No direct imports between
// feature modules.
//
// Handlers run in their own microtask via Promise.resolve().then(...) so a
// slow handler doesn't block the originating request. Errors are logged,
// not re-thrown — emit is fire-and-forget.
//
// R6 — `subscribeForPlugin(pluginId, eventName, handler)` adds tenant-
// filtered fan-out: when ecommerce emits `order.created` for client X,
// only plugins **installed for client X** (or agency-wide for X's
// agency) actually receive the event. This is the cross-plugin router
// the architecture has needed since Round 3.

export type AquaEventName =
  // Tenant lifecycle
  | "agency.created"
  | "client.created"
  | "client.updated"
  | "client.archived"
  | "client.stage_changed"
  // Auth
  | "user.signed_up"
  | "user.signed_in"
  | "user.password_reset"
  // Plugins
  | "plugin.installed"
  | "plugin.uninstalled"
  | "plugin.enabled"
  | "plugin.disabled"
  | "plugin.configured"
  // Phases
  | "phase.advanced"
  | "phase.checklist_item_completed"
  // Fulfillment (T2 will emit these)
  | "brief.created"
  | "deliverable.submitted"
  | "deliverable.approved"
  // Website-editor (T3)
  | "page.published";

export interface AquaEvent<T = unknown> {
  name: AquaEventName;
  agencyId: string;
  clientId?: string;
  payload: T;
  emittedAt: number;
}

// `string` widens beyond AquaEventName so plugin-defined names
// (`order.created`, `membership.subscription_changed`,
// `affiliate.attribution_recorded`, …) flow through without forcing a
// foundation-side enum bump every time a plugin adds an event.
type EventName = AquaEventName | string;
type Handler = (event: AquaEvent) => void | Promise<void>;

const SUBSCRIBERS: Map<EventName, Set<Handler>> = new Map();
const WILDCARD: Set<Handler> = new Set();

interface PluginSubscription {
  pluginId: string;
  handler: Handler;
}

const PLUGIN_SUBSCRIBERS: Map<EventName, PluginSubscription[]> = new Map();

export function on(name: EventName | "*", handler: Handler): () => void {
  if (name === "*") {
    WILDCARD.add(handler);
    return () => { WILDCARD.delete(handler); };
  }
  let set = SUBSCRIBERS.get(name);
  if (!set) {
    set = new Set();
    SUBSCRIBERS.set(name, set);
  }
  set.add(handler);
  const ref = set;
  return () => { ref.delete(handler); };
}

// R6 — tenant-filtered subscription. `subscribeForPlugin` registers a
// handler that ONLY fires when the emitted event's (agencyId, clientId)
// scope has the subscribing plugin installed and enabled. Agency-scoped
// installs (clientId === undefined on the install) match every event
// emitted under their agency, regardless of the event's clientId.
export function subscribeForPlugin(
  pluginId: string,
  eventName: EventName,
  handler: Handler,
): () => void {
  let bucket = PLUGIN_SUBSCRIBERS.get(eventName);
  if (!bucket) {
    bucket = [];
    PLUGIN_SUBSCRIBERS.set(eventName, bucket);
  }
  const sub: PluginSubscription = { pluginId, handler };
  bucket.push(sub);
  const ref = bucket;
  return () => {
    const i = ref.indexOf(sub);
    if (i >= 0) ref.splice(i, 1);
  };
}

export function emit<T = unknown>(
  scope: { agencyId: string; clientId?: string },
  name: EventName,
  payload: T,
): void {
  const event: AquaEvent<T> = {
    name: name as AquaEventName,
    agencyId: scope.agencyId,
    clientId: scope.clientId,
    payload,
    emittedAt: Date.now(),
  };
  // Untyped subscribers + wildcard — fire unconditionally (these are
  // foundation-internal listeners, not plugin subscribers).
  const direct = [
    ...(SUBSCRIBERS.get(name) ?? []),
    ...WILDCARD,
  ];
  for (const handler of direct) {
    Promise.resolve()
      .then(() => handler(event))
      .catch(err => console.error(`[eventBus] handler for ${name} threw:`, err));
  }
  // Plugin subscribers — tenant-filtered fan-out.
  const plugin = PLUGIN_SUBSCRIBERS.get(name);
  if (!plugin || plugin.length === 0) return;
  Promise.resolve()
    .then(async () => {
      // Lazy import to dodge a require-cycle: pluginInstalls reads
      // from storage, which (in some build modes) imports through this
      // module. The import resolves once at first emit.
      const { getInstall } = await import("./pluginInstalls");
      for (const sub of plugin) {
        const install =
          getInstall({ agencyId: event.agencyId, clientId: event.clientId }, sub.pluginId)
          ?? getInstall({ agencyId: event.agencyId }, sub.pluginId);
        if (!install || !install.enabled) continue;
        Promise.resolve()
          .then(() => sub.handler(event))
          .catch(err => console.error(`[eventBus] ${sub.pluginId}/${name} handler threw:`, err));
      }
    })
    .catch(err => console.error(`[eventBus] fan-out for ${name} failed:`, err));
}

export function describeSubscribers(): Array<{ event: string; handlers: number; pluginHandlers: number }> {
  const out: Array<{ event: string; handlers: number; pluginHandlers: number }> = [];
  const events = new Set<string>([
    ...SUBSCRIBERS.keys(),
    ...PLUGIN_SUBSCRIBERS.keys(),
  ]);
  for (const name of events) {
    out.push({
      event: name,
      handlers: SUBSCRIBERS.get(name)?.size ?? 0,
      pluginHandlers: PLUGIN_SUBSCRIBERS.get(name)?.length ?? 0,
    });
  }
  if (WILDCARD.size > 0) {
    out.push({ event: "*", handlers: WILDCARD.size, pluginHandlers: 0 });
  }
  return out;
}

// Test/dev-only: drop every subscriber so a smoke harness can run a
// clean scenario.
export function _resetForTests(): void {
  SUBSCRIBERS.clear();
  PLUGIN_SUBSCRIBERS.clear();
  WILDCARD.clear();
}
