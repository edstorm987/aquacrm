import "server-only";

import { assertWritesAllowed } from "@/lib/server/auth/securityControl";
import {
  assertFreshWriteAdmission,
  WriteAdmissionDeniedError,
  type PlatformWritePurpose,
  type WriteAdmissionContext,
} from "@/lib/server/security/writeAdmission";

export interface ServiceRoleEffectContext {
  /** Stable, classified name recorded when containment refuses an effect. */
  surface: string;
  /** Tenant lineage when the client is scoped to one tenant. */
  tenantId?: string;
  /** Required instead of tenantId for a deliberately cross-tenant mutation. */
  platformPurpose?: PlatformWritePurpose;
  actor?: string;
}

const POSTGREST_MUTATIONS = new Set<PropertyKey>(["insert", "upsert", "update", "delete"]);
const STORAGE_MUTATIONS = new Set<PropertyKey>([
  "upload",
  "update",
  "move",
  "copy",
  "remove",
  "createSignedUploadUrl",
]);
const STORAGE_ADMIN_MUTATIONS = new Set<PropertyKey>([
  "createBucket",
  "updateBucket",
  "emptyBucket",
  "deleteBucket",
]);
const AUTH_ADMIN_MUTATIONS = new Set<PropertyKey>([
  "createUser",
  "updateUserById",
  "deleteUser",
  "inviteUserByEmail",
  "generateLink",
]);

function mutationGuard(context: ServiceRoleEffectContext): () => void {
  return () => assertWritesAllowed(context.surface, {
    tenantId: context.tenantId,
    actor: context.actor,
  });
}

function authoritativeContext(context: ServiceRoleEffectContext): WriteAdmissionContext {
  const tenantId = context.tenantId?.trim();
  if (tenantId) {
    return { kind: "tenant", tenantId, surface: context.surface, actor: context.actor };
  }
  if (context.platformPurpose) {
    return {
      kind: "platform",
      purpose: context.platformPurpose,
      surface: context.surface,
      actor: context.actor,
    };
  }
  throw new WriteAdmissionDeniedError(
    context.surface,
    "context",
    "a service-role mutation requires trusted tenant lineage or a closed platform purpose",
  );
}

/**
 * The fluent Supabase builders do not execute until awaited, so a synchronous
 * method proxy can only be a fast tripwire.  This fetch wrapper is the awaited
 * final application boundary: every service-role mutation takes a fresh,
 * no-store durable admission snapshot immediately before transport starts.
 */
export function createWriteAdmittedFetch(
  context: ServiceRoleEffectContext,
  fetchImpl: typeof fetch = fetch,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method
      ?? (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET"))
      .toUpperCase();
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      await assertFreshWriteAdmission(authoritativeContext(context));
    }
    return fetchImpl(input, init);
  }) as typeof fetch;
}

function wrapMethods<T extends object>(target: T, guarded: ReadonlySet<PropertyKey>, guard: () => void): T {
  return new Proxy(target, {
    get(inner, property, receiver) {
      const value = Reflect.get(inner, property, receiver) as unknown;
      if (typeof value !== "function") return value;
      if (guarded.has(property)) {
        return (...args: unknown[]) => {
          guard();
          return Reflect.apply(value, inner, args);
        };
      }
      return value.bind(inner);
    },
  });
}

/**
 * Bind a Supabase client created with a service-role/secret key at the actual
 * SDK mutation methods. Reads (`select`, `download`, `listUsers`, etc.) remain
 * available during containment; writes, RPCs and function invocations fail
 * before the SDK can issue a network request.
 *
 * This is intentionally structural rather than coupled to a specific SDK
 * version so the two service-role client factories (admin + Master Inbox) can
 * share the same boundary. The static inventory ratchets those factories and
 * the mutation method set.
 */
export function guardServiceRoleClient<T extends object>(client: T, context: ServiceRoleEffectContext): T {
  const guard = mutationGuard(context);
  return new Proxy(client, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;

      if (property === "from" && typeof value === "function") {
        return (...args: unknown[]) => wrapMethods(
          Reflect.apply(value, target, args) as object,
          POSTGREST_MUTATIONS,
          guard,
        );
      }
      // Treat service-role RPC as an effect. Every deployable service-role RPC
      // currently performs an ingest/claim/checkpoint/settle mutation; a future
      // read-only RPC must be explicitly split/classified rather than silently
      // weakening this default.
      if (property === "rpc" && typeof value === "function") {
        return (...args: unknown[]) => {
          guard();
          return Reflect.apply(value, target, args);
        };
      }
      if (property === "schema" && typeof value === "function") {
        return (...args: unknown[]) => guardServiceRoleClient(
          Reflect.apply(value, target, args) as object,
          context,
        );
      }
      if (property === "storage" && value && typeof value === "object") {
        const storage = value as Record<PropertyKey, unknown>;
        return new Proxy(storage, {
          get(storageTarget, storageProperty, storageReceiver) {
            const storageValue = Reflect.get(storageTarget, storageProperty, storageReceiver) as unknown;
            if (storageProperty === "from" && typeof storageValue === "function") {
              return (...args: unknown[]) => wrapMethods(
                Reflect.apply(storageValue, storageTarget, args) as object,
                STORAGE_MUTATIONS,
                guard,
              );
            }
            if (typeof storageValue === "function" && STORAGE_ADMIN_MUTATIONS.has(storageProperty)) {
              return (...args: unknown[]) => {
                guard();
                return Reflect.apply(storageValue, storageTarget, args);
              };
            }
            return typeof storageValue === "function" ? storageValue.bind(storageTarget) : storageValue;
          },
        });
      }
      if (property === "auth" && value && typeof value === "object") {
        const auth = value as Record<PropertyKey, unknown>;
        return new Proxy(auth, {
          get(authTarget, authProperty, authReceiver) {
            const authValue = Reflect.get(authTarget, authProperty, authReceiver) as unknown;
            if (authProperty === "admin" && authValue && typeof authValue === "object") {
              return wrapMethods(authValue as object, AUTH_ADMIN_MUTATIONS, guard);
            }
            return typeof authValue === "function" ? authValue.bind(authTarget) : authValue;
          },
        });
      }
      if (property === "functions" && value && typeof value === "object") {
        return wrapMethods(value as object, new Set<PropertyKey>(["invoke"]), guard);
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export const SERVICE_ROLE_MUTATION_METHODS = Object.freeze({
  postgrest: [...POSTGREST_MUTATIONS].map(String),
  storage: [...STORAGE_MUTATIONS].map(String),
  storageAdmin: [...STORAGE_ADMIN_MUTATIONS].map(String),
  authAdmin: [...AUTH_ADMIN_MUTATIONS].map(String),
  rpc: ["rpc"],
  functions: ["invoke"],
});
