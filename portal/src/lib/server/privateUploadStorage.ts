import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { put } from "@vercel/blob";

export class PrivateUploadStorageError extends Error {
  readonly code = "durable_private_uploads_required";

  constructor() {
    super("Private file storage is not connected. Connect Vercel Blob before accepting production uploads.");
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
  storageProvider: "vercel-blob" | "local";
  storageKey: string;
}

export function privateUploadsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
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
