import "server-only";

import crypto from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  getActiveDataRealmId,
  getBackendInfo,
  getFileBackendDataPath,
} from "./storage";
import {
  atomicReplaceDevFile,
  withDevFileTransaction,
} from "@/lib/server/dev/devFileTransaction";

const DEFAULT_LEASE_MS = 5 * 60_000;
const DEFAULT_WAIT_MS = 12_000;

export interface LeadConversionClaimInput {
  claimKey: string;
  requestHash: string;
  holderId: string;
  leaseMs?: number;
}

export type LeadConversionClaim =
  | { state: "claimed"; leaseExpiresAt: number }
  | { state: "held"; leaseExpiresAt: number }
  | { state: "complete"; leaseExpiresAt: number; result: unknown }
  | { state: "conflict"; leaseExpiresAt: number };

export interface LeadConversionCoordinator {
  claim(input: LeadConversionClaimInput): Promise<LeadConversionClaim>;
  complete(input: LeadConversionClaimInput & { result: unknown }): Promise<void>;
  fail(input: LeadConversionClaimInput & { error: string }): Promise<void>;
}

interface LocalLeadConversionOperation {
  requestHash: string;
  holderId: string;
  status: "claimed" | "complete" | "failed";
  leaseExpiresAt: number;
  result?: unknown;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

interface LocalLeadConversionFile {
  version: 1;
  operations: Record<string, LocalLeadConversionOperation>;
}

function boundedLeaseMs(value: number | undefined): number {
  return Math.max(1_000, Math.min(value ?? DEFAULT_LEASE_MS, DEFAULT_LEASE_MS));
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .filter(key => object[key] !== undefined)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(",")}}`;
}

export function leadConversionClaimKey(input: {
  agencyId: string;
  leadId: string;
  email?: string;
}): string {
  const email = input.email?.trim().toLowerCase();
  const identity = email ? `email:${email}` : `lead:${input.leadId}`;
  return crypto
    .createHash("sha256")
    .update(["lead-conversion", input.agencyId, identity].join("\u0000"))
    .digest("hex");
}

export function leadConversionRequestHash(value: unknown): string {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

export function leadConversionHolderId(): string {
  return `lead-conversion:${process.pid}:${crypto.randomUUID()}`;
}

function claimFromOperation(
  operation: LocalLeadConversionOperation,
  requestHash: string,
): LeadConversionClaim {
  if (operation.requestHash !== requestHash) {
    return { state: "conflict", leaseExpiresAt: operation.leaseExpiresAt };
  }
  if (operation.status === "complete") {
    return {
      state: "complete",
      leaseExpiresAt: operation.leaseExpiresAt,
      result: operation.result,
    };
  }
  return { state: "held", leaseExpiresAt: operation.leaseExpiresAt };
}

export function createMemoryLeadConversionCoordinator(
  now: () => number = Date.now,
): LeadConversionCoordinator {
  const operations = new Map<string, LocalLeadConversionOperation>();
  return {
    async claim(input) {
      const at = now();
      const existing = operations.get(input.claimKey);
      if (existing?.requestHash !== undefined && existing.requestHash !== input.requestHash) {
        return { state: "conflict", leaseExpiresAt: existing.leaseExpiresAt };
      }
      if (existing?.status === "complete") return claimFromOperation(existing, input.requestHash);
      if (
        existing?.status === "claimed"
        && existing.holderId !== input.holderId
        && existing.leaseExpiresAt > at
      ) {
        return { state: "held", leaseExpiresAt: existing.leaseExpiresAt };
      }
      const leaseExpiresAt = at + boundedLeaseMs(input.leaseMs);
      operations.set(input.claimKey, {
        requestHash: input.requestHash,
        holderId: input.holderId,
        status: "claimed",
        leaseExpiresAt,
        createdAt: existing?.createdAt ?? at,
        updatedAt: at,
      });
      return { state: "claimed", leaseExpiresAt };
    },
    async complete(input) {
      const at = now();
      const existing = operations.get(input.claimKey);
      if (
        !existing
        || existing.requestHash !== input.requestHash
        || existing.status !== "claimed"
        || existing.holderId !== input.holderId
        || existing.leaseExpiresAt <= at
      ) {
        throw new Error("lead_conversion_claim_not_held");
      }
      operations.set(input.claimKey, {
        ...existing,
        status: "complete",
        result: input.result,
        lastError: undefined,
        updatedAt: at,
        completedAt: at,
      });
    },
    async fail(input) {
      const at = now();
      const existing = operations.get(input.claimKey);
      if (
        !existing
        || existing.requestHash !== input.requestHash
        || existing.status !== "claimed"
        || existing.holderId !== input.holderId
        || existing.leaseExpiresAt <= at
      ) return;
      operations.set(input.claimKey, {
        ...existing,
        status: "failed",
        lastError: input.error.slice(0, 1_000),
        updatedAt: at,
        leaseExpiresAt: at,
      });
    },
  };
}

async function readLocalFile(path: string): Promise<LocalLeadConversionFile> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<LocalLeadConversionFile>;
    if (!parsed || parsed.version !== 1 || !parsed.operations || typeof parsed.operations !== "object") {
      throw new Error("lead conversion operation file has an invalid shape");
    }
    return { version: 1, operations: parsed.operations };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, operations: {} };
    }
    throw error;
  }
}

function createFileLeadConversionCoordinator(path: string): LeadConversionCoordinator {
  return {
    async claim(input) {
      return withDevFileTransaction(path, async () => {
        const file = await readLocalFile(path);
        const at = Date.now();
        const existing = file.operations[input.claimKey];
        if (existing?.requestHash !== undefined && existing.requestHash !== input.requestHash) {
          return { state: "conflict", leaseExpiresAt: existing.leaseExpiresAt } as const;
        }
        if (existing?.status === "complete") return claimFromOperation(existing, input.requestHash);
        if (
          existing?.status === "claimed"
          && existing.holderId !== input.holderId
          && existing.leaseExpiresAt > at
        ) {
          return { state: "held", leaseExpiresAt: existing.leaseExpiresAt } as const;
        }
        const leaseExpiresAt = at + boundedLeaseMs(input.leaseMs);
        file.operations[input.claimKey] = {
          requestHash: input.requestHash,
          holderId: input.holderId,
          status: "claimed",
          leaseExpiresAt,
          createdAt: existing?.createdAt ?? at,
          updatedAt: at,
        };
        await atomicReplaceDevFile(path, JSON.stringify(file));
        return { state: "claimed", leaseExpiresAt } as const;
      });
    },
    async complete(input) {
      await withDevFileTransaction(path, async () => {
        const file = await readLocalFile(path);
        const at = Date.now();
        const existing = file.operations[input.claimKey];
        if (
          !existing
          || existing.requestHash !== input.requestHash
          || existing.status !== "claimed"
          || existing.holderId !== input.holderId
          || existing.leaseExpiresAt <= at
        ) throw new Error("lead_conversion_claim_not_held");
        file.operations[input.claimKey] = {
          ...existing,
          status: "complete",
          result: input.result,
          lastError: undefined,
          updatedAt: at,
          completedAt: at,
        };
        await atomicReplaceDevFile(path, JSON.stringify(file));
      });
    },
    async fail(input) {
      await withDevFileTransaction(path, async () => {
        const file = await readLocalFile(path);
        const at = Date.now();
        const existing = file.operations[input.claimKey];
        if (
          !existing
          || existing.requestHash !== input.requestHash
          || existing.status !== "claimed"
          || existing.holderId !== input.holderId
          || existing.leaseExpiresAt <= at
        ) return;
        file.operations[input.claimKey] = {
          ...existing,
          status: "failed",
          lastError: input.error.slice(0, 1_000),
          updatedAt: at,
          leaseExpiresAt: at,
        };
        await atomicReplaceDevFile(path, JSON.stringify(file));
      });
    },
  };
}

function normaliseRemoteClaim(value: unknown): LeadConversionClaim {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const state = row.state;
  const leaseExpiresAt = Number(row.leaseExpiresAt);
  if (!Number.isFinite(leaseExpiresAt)) throw new Error("lead_conversion_claim_invalid");
  if (state === "complete") {
    return { state, leaseExpiresAt, result: row.result };
  }
  if (state === "claimed" || state === "held" || state === "conflict") {
    return { state, leaseExpiresAt };
  }
  throw new Error("lead_conversion_claim_invalid");
}

const memoryCoordinator = createMemoryLeadConversionCoordinator();
let fileCoordinator: { path: string; coordinator: LeadConversionCoordinator } | null = null;

export function leadConversionCoordinator(): LeadConversionCoordinator {
  const backend = getBackendInfo().kind;
  const realmId = getActiveDataRealmId();
  if (backend === "file") {
    const dataPath = getFileBackendDataPath();
    if (!dataPath) throw new Error("lead_conversion_file_backend_path_missing");
    const path = `${dataPath}.lead-conversions.json`;
    if (!fileCoordinator || fileCoordinator.path !== path) {
      fileCoordinator = { path, coordinator: createFileLeadConversionCoordinator(path) };
    }
    return fileCoordinator.coordinator;
  }
  if (backend === "supabase" || backend === "postgres") {
    return {
      async claim(input) {
        if (backend === "supabase") {
          const storage = await import("./storageSupabase");
          return normaliseRemoteClaim(await storage.claimLeadConversion(
            input.claimKey, input.requestHash, input.holderId,
            boundedLeaseMs(input.leaseMs), {}, realmId,
          ));
        }
        const storage = await import("./storagePostgres");
        return normaliseRemoteClaim(await storage.claimLeadConversion(
          input.claimKey, input.requestHash, input.holderId,
          boundedLeaseMs(input.leaseMs), realmId,
        ));
      },
      async complete(input) {
        if (backend === "supabase") {
          const storage = await import("./storageSupabase");
          await storage.completeLeadConversion(
            input.claimKey, input.requestHash, input.holderId, input.result, {}, realmId,
          );
          return;
        }
        const storage = await import("./storagePostgres");
        await storage.completeLeadConversion(
          input.claimKey, input.requestHash, input.holderId, input.result, realmId,
        );
      },
      async fail(input) {
        if (backend === "supabase") {
          const storage = await import("./storageSupabase");
          await storage.failLeadConversion(
            input.claimKey, input.requestHash, input.holderId, input.error, {}, realmId,
          );
          return;
        }
        const storage = await import("./storagePostgres");
        await storage.failLeadConversion(
          input.claimKey, input.requestHash, input.holderId, input.error, realmId,
        );
      },
    };
  }
  return memoryCoordinator;
}

export async function acquireLeadConversion(
  coordinator: LeadConversionCoordinator,
  input: LeadConversionClaimInput,
  waitMs = DEFAULT_WAIT_MS,
): Promise<LeadConversionClaim> {
  const deadline = Date.now() + Math.max(0, waitMs);
  let delayMs = 35;
  for (;;) {
    const claim = await coordinator.claim(input);
    if (claim.state !== "held" || Date.now() >= deadline) return claim;
    await new Promise(resolve => setTimeout(resolve, delayMs));
    delayMs = Math.min(300, Math.round(delayMs * 1.5));
  }
}
