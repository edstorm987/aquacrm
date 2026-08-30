import "server-only";

import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { del, put } from "@vercel/blob";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertLiveProviderAccess } from "@/lib/server/sandbox/providerPolicy";
import { isSandboxDataRealm } from "@/server/dataRealm";

export type PrivateUploadStorageProvider = "supabase" | "vercel-blob" | "local";

const DEFAULT_SUPABASE_UPLOAD_BUCKET = "aquacrm-uploads";

export class PrivateUploadStorageError extends Error {
  readonly code = "durable_private_uploads_required";

  constructor() {
    super("Private file storage is not connected. Connect the Supabase private upload bucket before accepting production uploads.");
    this.name = "PrivateUploadStorageError";
  }
}

export interface StorePrivateUploadInput {
  pathname: string;
  file: Blob;
  contentType: string;
  localDirectory: string;
  localKey: string;
}

export interface StoredPrivateUpload {
  storageProvider: PrivateUploadStorageProvider;
  storageKey: string;
}

export function supabasePrivateUploadsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    && env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

export function privateUploadsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return supabasePrivateUploadsConfigured(env) || Boolean(
    env.BLOB_READ_WRITE_TOKEN?.trim()
    || env.BLOB_STORE_ID?.trim()
    || env.VERCEL_OIDC_TOKEN?.trim(),
  );
}

export function durablePrivateUploadsRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production"
    || env.VERCEL === "1"
    || Boolean(env.VERCEL_ENV);
}

export async function storePrivateUpload(input: StorePrivateUploadInput): Promise<StoredPrivateUpload> {
  assertLiveProviderAccess("Private file storage");
  if (supabasePrivateUploadsConfigured()) {
    const bucket = process.env.NEXT_PUBLIC_SUPABASE_UPLOAD_BUCKET?.trim()
      || DEFAULT_SUPABASE_UPLOAD_BUCKET;
    const admin = createSupabaseAdminClient();
    const { error } = await admin.storage.from(bucket).upload(input.pathname, input.file, {
      cacheControl: "3600",
      contentType: input.contentType,
      upsert: false,
    });
    if (error) throw new Error(`Could not store private upload: ${error.message}`);
    return { storageProvider: "supabase", storageKey: input.pathname };
  }

  if (privateUploadsConfigured()) {
    const blob = await put(input.pathname, input.file, {
      access: "private",
      addRandomSuffix: false,
      contentType: input.contentType,
    });
    return { storageProvider: "vercel-blob", storageKey: blob.url };
  }

  if (durablePrivateUploadsRequired()) throw new PrivateUploadStorageError();

  const absolutePath = join(process.cwd(), ".data", input.localDirectory, input.localKey);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, Buffer.from(await input.file.arrayBuffer()));
  return { storageProvider: "local", storageKey: input.localKey };
}

export async function readSupabasePrivateUpload(storageKey: string): Promise<Blob | null> {
  if (!supabasePrivateUploadsConfigured() || !storageKey.trim()) return null;
  const bucket = process.env.NEXT_PUBLIC_SUPABASE_UPLOAD_BUCKET?.trim()
    || DEFAULT_SUPABASE_UPLOAD_BUCKET;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(bucket).download(storageKey);
  return error ? null : data;
}

async function removeSupabasePrivateUpload(storageKey: string): Promise<void> {
  assertLiveProviderAccess("Private file deletion");
  if (!supabasePrivateUploadsConfigured()) {
    throw new Error("Supabase private storage is not connected, so the stored file could not be removed.");
  }
  const bucket = process.env.NEXT_PUBLIC_SUPABASE_UPLOAD_BUCKET?.trim()
    || DEFAULT_SUPABASE_UPLOAD_BUCKET;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(bucket).remove([storageKey]);
  if (error) throw new Error(error.message);
}

export async function deleteSupabasePrivateUpload(storageKey: string): Promise<boolean> {
  if (!storageKey.trim()) return false;
  try {
    await removeSupabasePrivateUpload(storageKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Why a stored binary was, or was not, removed. `skipped` means there was
 * nothing this deployment could remove (no stored object, or a Sandbox realm
 * that must never touch a live provider); it is never used to describe a
 * provider that refused.
 */
export type PrivateUploadDeletionOutcome = "deleted" | "skipped" | "failed";

export interface PrivateUploadDeletion {
  ok: boolean;
  outcome: PrivateUploadDeletionOutcome;
  /** Provider-reported reason, retained so a caller can report and retry it. */
  error?: string;
}

export interface DeletePrivateUploadInput {
  storageProvider?: string | null;
  storageKey?: string | null;
  /** Directory under `.data` that owns `local` keys for this surface. */
  localDirectory: string;
}

/**
 * Provider seam. Routes always take the defaults; tests inject a refusing
 * provider so the "the binary is still there" path is exercised for real
 * rather than asserted from source shape.
 */
export interface PrivateUploadDeleteProviders {
  supabase?: (storageKey: string) => Promise<void>;
  vercelBlob?: (storageKey: string) => Promise<void>;
  local?: (absolutePath: string) => Promise<void>;
}

/**
 * The one place a private upload's binary is removed. It reports what actually
 * happened instead of swallowing the provider error: a caller must not delete
 * the owning record, nor answer the operator "removed", when this returns
 * `ok: false`.
 */
export async function deletePrivateUpload(
  input: DeletePrivateUploadInput,
  providers: PrivateUploadDeleteProviders = {},
): Promise<PrivateUploadDeletion> {
  const provider = (input.storageProvider ?? "").trim();
  const storageKey = (input.storageKey ?? "").trim();
  if (!provider || !storageKey) return { ok: true, outcome: "skipped" };
  if (isSandboxDataRealm()) return { ok: true, outcome: "skipped" };

  try {
    if (provider === "supabase") {
      await (providers.supabase ?? removeSupabasePrivateUpload)(storageKey);
    } else if (provider === "vercel-blob") {
      await (providers.vercelBlob ?? (async key => { await del(key); }))(storageKey);
    } else if (provider === "local") {
      const uploadRoot = resolve(process.cwd(), ".data", input.localDirectory);
      const targetPath = resolve(uploadRoot, storageKey);
      if (!targetPath.startsWith(`${uploadRoot}${sep}`)) {
        return { ok: false, outcome: "failed", error: `Stored path “${storageKey}” is outside ${input.localDirectory}.` };
      }
      // `force` keeps an already-removed file a success — deletion is idempotent,
      // a refusing filesystem is not.
      await (providers.local ?? (async path => { await rm(path, { force: true }); }))(targetPath);
    } else {
      return { ok: false, outcome: "failed", error: `Unknown storage provider “${provider}”.` };
    }
    return { ok: true, outcome: "deleted" };
  } catch (error) {
    return { ok: false, outcome: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Compensating delete for an upload whose owning record could not be written.
 * Without it the binary is billed, readable by key and referenced by nothing.
 */
export async function compensatePrivateUpload(
  stored: StoredPrivateUpload,
  localDirectory: string,
): Promise<PrivateUploadDeletion> {
  return deletePrivateUpload({
    storageProvider: stored.storageProvider,
    storageKey: stored.storageKey,
    localDirectory,
  });
}

export interface AttachedPrivateUpload<T> { ok: true; value: T }

export interface UnattachedPrivateUpload {
  ok: false;
  /** True when the orphaned binary was actually removed again. */
  compensated: boolean;
  storageKey: string;
  message: string;
  detail?: string;
}

export type AttachPrivateUploadResult<T> = AttachedPrivateUpload<T> | UnattachedPrivateUpload;

/**
 * Writes the record that owns a just-stored binary. If the record cannot be
 * written the binary is compensated away, and the caller is told which of the
 * two states it is in — "removed, retry" or "still stored, attached to
 * nothing". Neither may be reported to a person as a successful upload.
 */
export async function attachStoredPrivateUpload<T>(
  stored: StoredPrivateUpload,
  localDirectory: string,
  attach: () => T | Promise<T>,
): Promise<AttachPrivateUploadResult<T>> {
  let value: T;
  try {
    value = await attach();
  } catch (error) {
    const compensation = await compensatePrivateUpload(stored, localDirectory);
    return {
      ok: false,
      compensated: compensation.ok,
      storageKey: stored.storageKey,
      message: compensation.ok
        ? "The upload could not be recorded, so the stored copy was removed. Nothing was kept — please try again."
        : "The upload could not be recorded and the stored copy could not be removed either. It is stored but attached to nothing; report this before retrying.",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  return { ok: true, value };
}
