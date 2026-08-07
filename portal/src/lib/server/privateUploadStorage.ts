import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { put } from "@vercel/blob";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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

export async function deleteSupabasePrivateUpload(storageKey: string): Promise<boolean> {
  if (!supabasePrivateUploadsConfigured() || !storageKey.trim()) return false;
  const bucket = process.env.NEXT_PUBLIC_SUPABASE_UPLOAD_BUCKET?.trim()
    || DEFAULT_SUPABASE_UPLOAD_BUCKET;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(bucket).remove([storageKey]);
  return !error;
}
