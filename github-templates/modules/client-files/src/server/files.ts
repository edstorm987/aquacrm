// FileService — per-client file vault.
//
// Storage layout (per-install, client-scoped):
//   files/index             → string[] of file ids
//   files/by-id/<id>        → FileMetadata
//   file-body/<id>          → string (base64) — only for inline storage
//   files/share/<token>     → string (file id) — share-link reverse index

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type {
  CategoryCount,
  FileCategory,
  FileFilter,
  FileMetadata,
  FileStorageKind,
  FileWithBody,
  UploadInput,
} from "../lib/domain";
import { FILE_CATEGORIES, INLINE_MAX_BYTES } from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";

const INDEX_KEY = "files/index";
const fileKey = (id: string): string => `files/by-id/${id}`;
const bodyKey = (id: string): string => `file-body/${id}`;
const shareKey = (token: string): string => `files/share/${token}`;

export class FilePayloadTooLargeError extends Error {
  constructor(public sizeBytes: number) {
    super(`client-files: payload exceeds inline cap (${sizeBytes} bytes)`);
    this.name = "FilePayloadTooLargeError";
  }
}

export class FileNotFoundError extends Error {
  constructor(message = "client-files: not found") {
    super(message); this.name = "FileNotFoundError";
  }
}

function generateShareToken(): string {
  const cryptoApi = (globalThis as unknown as { crypto?: Crypto }).crypto;
  const buf = new Uint8Array(16);
  if (cryptoApi?.getRandomValues) cryptoApi.getRandomValues(buf);
  else for (let i = 0; i < 16; i++) buf[i] = Math.floor(Math.random() * 256);
  return Array.from(buf, b => b.toString(16).padStart(2, "0")).join("");
}

// Visibility predicate — agency callers see everything; non-agency
// (client-shell, freelancer, end-customer) only see rows where
// `visibleToClient: true`.
export function canSee(file: FileMetadata, isAgency: boolean): boolean {
  if (isAgency) return true;
  return file.visibleToClient;
}

export class FileService {
  constructor(
    private agencyId: AgencyId,
    private clientId: ClientId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  private inScope(f: FileMetadata): boolean {
    return f.agencyId === this.agencyId && f.clientId === this.clientId;
  }

  async list(actor: { userId: UserId; isAgency: boolean }, filter: FileFilter = {}): Promise<FileMetadata[]> {
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    const out: FileMetadata[] = [];
    for (const id of ids) {
      const f = await this.storage.get<FileMetadata>(fileKey(id));
      if (!f || !this.inScope(f)) continue;
      if (!canSee(f, actor.isAgency)) continue;
      if (filter.category && f.category !== filter.category) continue;
      if (filter.visibleToClient !== undefined && f.visibleToClient !== filter.visibleToClient) continue;
      if (filter.query) {
        const q = filter.query.toLowerCase();
        if (!f.name.toLowerCase().includes(q)) continue;
      }
      out.push(f);
    }
    return out.sort((a, b) => b.uploadedAt - a.uploadedAt);
  }

  async get(actor: { userId: UserId; isAgency: boolean }, id: string): Promise<FileMetadata | null> {
    const f = await this.storage.get<FileMetadata>(fileKey(id));
    if (!f || !this.inScope(f)) return null;
    if (!canSee(f, actor.isAgency)) return null;
    return f;
  }

  // Returns the file metadata and (for inline storage) the base64 body.
  // External-storage callers receive `externalRef` and must dereference
  // themselves — the plugin doesn't know how to read S3 / FS in v1.
  async getWithBody(actor: { userId: UserId; isAgency: boolean }, id: string): Promise<FileWithBody | null> {
    const meta = await this.get(actor, id);
    if (!meta) return null;
    if (meta.storage === "inline") {
      const body = await this.storage.get<string>(bodyKey(id));
      return { ...meta, body };
    }
    return { ...meta, externalRef: meta.storageRef };
  }

  async upload(actor: UserId, input: UploadInput): Promise<FileMetadata> {
    if (!input.name.trim()) throw new Error("client-files: name required");
    if (!FILE_CATEGORIES.includes(input.category)) throw new Error("client-files: invalid category");

    let storageKind: FileStorageKind;
    let storageRef: string;
    let sizeBytes: number;
    let inlineBody: string | undefined;

    if (input.body !== undefined) {
      sizeBytes = approxBytesFromBase64(input.body);
      if (sizeBytes > INLINE_MAX_BYTES) throw new FilePayloadTooLargeError(sizeBytes);
      const id = makeId("file");
      storageKind = "inline";
      storageRef = `inline:${id}`;
      inlineBody = input.body;
      const t = now();
      const meta: FileMetadata = {
        id,
        agencyId: this.agencyId,
        clientId: this.clientId,
        category: input.category,
        name: input.name.trim(),
        mimeType: input.mimeType,
        sizeBytes,
        storage: storageKind,
        storageRef,
        uploadedBy: actor,
        uploadedAt: t,
        visibleToClient: input.visibleToClient ?? false,
        createdAt: t,
        updatedAt: t,
      };
      await this.persist(meta, inlineBody);
      this.recordUpload(actor, meta);
      return meta;
    }

    if (input.external) {
      const id = makeId("file");
      storageKind = "external";
      storageRef = input.external.storageRef;
      sizeBytes = input.external.sizeBytes;
      const t = now();
      const meta: FileMetadata = {
        id,
        agencyId: this.agencyId,
        clientId: this.clientId,
        category: input.category,
        name: input.name.trim(),
        mimeType: input.mimeType,
        sizeBytes,
        storage: storageKind,
        storageRef,
        uploadedBy: actor,
        uploadedAt: t,
        visibleToClient: input.visibleToClient ?? false,
        createdAt: t,
        updatedAt: t,
      };
      await this.persist(meta);
      this.recordUpload(actor, meta);
      return meta;
    }

    throw new Error("client-files: provide body (base64) or external { storageRef, sizeBytes }");
  }

  private async persist(meta: FileMetadata, inlineBody?: string): Promise<void> {
    await this.storage.set(fileKey(meta.id), meta);
    if (inlineBody !== undefined) await this.storage.set(bodyKey(meta.id), inlineBody);
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    if (!ids.includes(meta.id)) await this.storage.set(INDEX_KEY, [...ids, meta.id]);
  }

  private recordUpload(actor: UserId, meta: FileMetadata): void {
    this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "settings", action: "client-files.file.uploaded",
      message: `File "${meta.name}" uploaded (${meta.category}, ${meta.sizeBytes}B, ${meta.storage})`,
      metadata: { fileId: meta.id, category: meta.category, storage: meta.storage },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "client-files.file.uploaded", { id: meta.id, category: meta.category });
  }

  async setCategory(actor: UserId, id: string, category: FileCategory): Promise<FileMetadata> {
    if (!FILE_CATEGORIES.includes(category)) throw new Error("client-files: invalid category");
    const f = await this.storage.get<FileMetadata>(fileKey(id));
    if (!f || !this.inScope(f)) throw new FileNotFoundError();
    const next: FileMetadata = { ...f, category, updatedAt: now() };
    await this.storage.set(fileKey(id), next);
    return next;
  }

  async setVisibleToClient(actor: UserId, id: string, visibleToClient: boolean): Promise<FileMetadata> {
    const f = await this.storage.get<FileMetadata>(fileKey(id));
    if (!f || !this.inScope(f)) throw new FileNotFoundError();
    const next: FileMetadata = { ...f, visibleToClient, updatedAt: now() };
    await this.storage.set(fileKey(id), next);
    return next;
  }

  async delete(actor: UserId, id: string): Promise<void> {
    const f = await this.storage.get<FileMetadata>(fileKey(id));
    if (!f || !this.inScope(f)) throw new FileNotFoundError();
    await this.storage.del(fileKey(id));
    if (f.storage === "inline") await this.storage.del(bodyKey(id));
    if (f.shareLinkToken) await this.storage.del(shareKey(f.shareLinkToken));
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    await this.storage.set(INDEX_KEY, ids.filter(x => x !== id));
    this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "settings", action: "client-files.file.deleted",
      message: `File "${f.name}" deleted`,
      metadata: { fileId: id },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "client-files.file.deleted", { id });
  }

  // Issue (or rotate) a share-link token. Calling twice rotates the
  // token: the previous one is removed from the reverse index.
  async setShareLink(actor: UserId, id: string): Promise<{ token: string; meta: FileMetadata }> {
    const f = await this.storage.get<FileMetadata>(fileKey(id));
    if (!f || !this.inScope(f)) throw new FileNotFoundError();
    if (f.shareLinkToken) await this.storage.del(shareKey(f.shareLinkToken));
    const token = generateShareToken();
    const next: FileMetadata = { ...f, shareLinkToken: token, shareLinkAt: now(), updatedAt: now() };
    await this.storage.set(fileKey(id), next);
    await this.storage.set(shareKey(token), id);
    this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "settings", action: "client-files.file.share_link_issued",
      message: `Share link issued for "${f.name}"`,
      metadata: { fileId: id },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "client-files.file.share_link_issued", { id, token });
    return { token, meta: next };
  }

  async revokeShareLink(actor: UserId, id: string): Promise<FileMetadata> {
    const f = await this.storage.get<FileMetadata>(fileKey(id));
    if (!f || !this.inScope(f)) throw new FileNotFoundError();
    if (f.shareLinkToken) await this.storage.del(shareKey(f.shareLinkToken));
    const next: FileMetadata = { ...f, shareLinkToken: undefined, shareLinkAt: undefined, updatedAt: now() };
    await this.storage.set(fileKey(id), next);
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "client-files.file.share_link_revoked", { id });
    return next;
  }

  // Anonymous resolve via share token — does NOT honour the
  // visibleToClient flag (the link itself is the auth). Caller is
  // expected to be a public route handler with rate-limit upstream.
  async resolveByShareToken(token: string): Promise<FileWithBody | null> {
    const id = await this.storage.get<string>(shareKey(token));
    if (!id) return null;
    const f = await this.storage.get<FileMetadata>(fileKey(id));
    if (!f || !this.inScope(f)) return null;
    if (f.shareLinkToken !== token) return null;
    if (f.storage === "inline") {
      const body = await this.storage.get<string>(bodyKey(id));
      return { ...f, body };
    }
    return { ...f, externalRef: f.storageRef };
  }

  async categoryCounts(actor: { userId: UserId; isAgency: boolean }): Promise<CategoryCount[]> {
    const all = await this.list(actor);
    const map = new Map<FileCategory, CategoryCount>();
    for (const cat of FILE_CATEGORIES) {
      map.set(cat, { category: cat, count: 0, totalBytes: 0 });
    }
    for (const f of all) {
      const slot = map.get(f.category);
      if (!slot) continue;
      slot.count++;
      slot.totalBytes += f.sizeBytes;
    }
    return [...map.values()];
  }
}

// Approximate decoded byte length for a base64 string. Standard
// formula: floor(input.length * 3 / 4) - padding count.
function approxBytesFromBase64(b64: string): number {
  if (!b64) return 0;
  const len = b64.length;
  let pad = 0;
  if (b64.endsWith("==")) pad = 2;
  else if (b64.endsWith("=")) pad = 1;
  return Math.max(0, Math.floor((len * 3) / 4) - pad);
}
