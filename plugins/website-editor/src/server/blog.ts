// R008 — Blog posts. Per-site CRUD scoped by (agencyId, clientId,
// siteId). Body is a `Block[]` BlockTree so posts can use any block
// from the catalogue (richer than the 02 portal's HTML-only body —
// chapter §1 contract).
//
// Slug uniqueness is enforced via a slug→id sidecar index so
// `/blog/[slug]` lookups are O(1) without scanning the full post list.

import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { AgencyId, ClientId } from "../lib/tenancy";
import type { Block } from "../types/block";
import { storageKeys } from "./storage-keys";
import { slugify } from "../lib/ids";

export type BlogPostStatus = "draft" | "published" | "archived";

export interface BlogPost {
  id: string;
  agencyId: AgencyId;
  clientId: ClientId;
  siteId: string;
  title: string;
  slug: string;
  body: Block[];
  excerpt?: string;
  coverImg?: string;
  tags: string[];
  author?: string;
  status: BlogPostStatus;
  publishedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreateBlogPostInput {
  agencyId: AgencyId;
  clientId: ClientId;
  siteId: string;
  title: string;
  slug?: string;
  body?: Block[];
  excerpt?: string;
  coverImg?: string;
  tags?: string[];
  author?: string;
  status?: BlogPostStatus;
}

export interface UpdateBlogPostPatch {
  title?: string;
  slug?: string;
  body?: Block[];
  excerpt?: string;
  coverImg?: string;
  tags?: string[];
  author?: string;
  status?: BlogPostStatus;
}

export interface ListBlogPostsFilter {
  status?: BlogPostStatus | "all";
  tag?: string;
  query?: string;
  limit?: number;
}

async function readSlugIndex(
  storage: PluginStorage, a: AgencyId, c: ClientId, siteId: string,
): Promise<Record<string, string>> {
  return (await storage.get<Record<string, string>>(storageKeys.blogSlugIndex(a, c, siteId))) ?? {};
}

async function writeSlugIndex(
  storage: PluginStorage, a: AgencyId, c: ClientId, siteId: string, idx: Record<string, string>,
): Promise<void> {
  await storage.set(storageKeys.blogSlugIndex(a, c, siteId), idx);
}

async function readPostIndex(
  storage: PluginStorage, a: AgencyId, c: ClientId, siteId: string,
): Promise<string[]> {
  return (await storage.get<string[]>(storageKeys.blogIndex(a, c, siteId))) ?? [];
}

async function writePostIndex(
  storage: PluginStorage, a: AgencyId, c: ClientId, siteId: string, ids: string[],
): Promise<void> {
  await storage.set(storageKeys.blogIndex(a, c, siteId), ids);
}

function postId(): string {
  return `post_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function uniqueSlug(
  storage: PluginStorage, a: AgencyId, c: ClientId, siteId: string,
  base: string, excludeId?: string,
): Promise<string> {
  const idx = await readSlugIndex(storage, a, c, siteId);
  let candidate = base;
  let n = 2;
  while (idx[candidate] && idx[candidate] !== excludeId) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  return candidate;
}

export class BlogSlugConflictError extends Error {
  override name = "BlogSlugConflictError";
  constructor(public readonly slug: string) {
    super(`slug already in use: ${slug}`);
  }
}

export async function createBlogPost(
  storage: PluginStorage,
  input: CreateBlogPostInput,
): Promise<BlogPost> {
  const id = postId();
  const now = Date.now();
  const baseSlug = slugify(input.slug ?? input.title) || "post";
  const slug = await uniqueSlug(storage, input.agencyId, input.clientId, input.siteId, baseSlug);
  const status: BlogPostStatus = input.status ?? "draft";
  const post: BlogPost = {
    id,
    agencyId: input.agencyId,
    clientId: input.clientId,
    siteId: input.siteId,
    title: input.title.trim() || "Untitled",
    slug,
    body: input.body ?? [],
    ...(input.excerpt ? { excerpt: input.excerpt } : {}),
    ...(input.coverImg ? { coverImg: input.coverImg } : {}),
    tags: input.tags ?? [],
    ...(input.author ? { author: input.author } : {}),
    status,
    ...(status === "published" ? { publishedAt: now } : {}),
    createdAt: now,
    updatedAt: now,
  };
  await storage.set(storageKeys.blogPost(input.agencyId, input.clientId, input.siteId, id), post);
  const ids = await readPostIndex(storage, input.agencyId, input.clientId, input.siteId);
  ids.unshift(id);
  await writePostIndex(storage, input.agencyId, input.clientId, input.siteId, ids);
  const idx = await readSlugIndex(storage, input.agencyId, input.clientId, input.siteId);
  idx[slug] = id;
  await writeSlugIndex(storage, input.agencyId, input.clientId, input.siteId, idx);
  return post;
}

export async function getBlogPost(
  storage: PluginStorage, a: AgencyId, c: ClientId, siteId: string, id: string,
): Promise<BlogPost | null> {
  return (await storage.get<BlogPost>(storageKeys.blogPost(a, c, siteId, id))) ?? null;
}

export async function getBlogPostBySlug(
  storage: PluginStorage, a: AgencyId, c: ClientId, siteId: string, slug: string,
): Promise<BlogPost | null> {
  const idx = await readSlugIndex(storage, a, c, siteId);
  const id = idx[slug];
  if (!id) return null;
  return getBlogPost(storage, a, c, siteId, id);
}

export async function listBlogPosts(
  storage: PluginStorage, a: AgencyId, c: ClientId, siteId: string,
  filter: ListBlogPostsFilter = {},
): Promise<BlogPost[]> {
  const ids = await readPostIndex(storage, a, c, siteId);
  const all = await Promise.all(ids.map(id => getBlogPost(storage, a, c, siteId, id)));
  let posts = all.filter((p): p is BlogPost => Boolean(p));

  // Status: omitted defaults to "all but archived" so admin lists feel
  // sensible; explicit "all" surfaces archived too.
  if (filter.status === "all") {
    // no-op
  } else if (filter.status) {
    posts = posts.filter(p => p.status === filter.status);
  } else {
    posts = posts.filter(p => p.status !== "archived");
  }

  if (filter.tag) {
    posts = posts.filter(p => p.tags.includes(filter.tag!));
  }
  if (filter.query) {
    const q = filter.query.toLowerCase();
    posts = posts.filter(p =>
      `${p.title} ${p.excerpt ?? ""} ${p.tags.join(" ")}`.toLowerCase().includes(q),
    );
  }

  // Newest-first: published posts sort by publishedAt desc, drafts/
  // archived by updatedAt desc, with published always above drafts.
  posts.sort((a, b) => {
    const aPub = a.status === "published" ? (a.publishedAt ?? a.updatedAt) : -Infinity;
    const bPub = b.status === "published" ? (b.publishedAt ?? b.updatedAt) : -Infinity;
    if (aPub !== bPub) return bPub - aPub;
    return b.updatedAt - a.updatedAt;
  });

  if (filter.limit && filter.limit > 0) posts = posts.slice(0, filter.limit);
  return posts;
}

export async function updateBlogPost(
  storage: PluginStorage, a: AgencyId, c: ClientId, siteId: string, id: string,
  patch: UpdateBlogPostPatch,
): Promise<BlogPost | null> {
  const cur = await getBlogPost(storage, a, c, siteId, id);
  if (!cur) return null;
  const now = Date.now();

  // Slug change: enforce uniqueness, swap the index entry. We accept
  // an explicit slug verbatim (after slugify) — if it collides with
  // another post we throw `BlogSlugConflictError` so the caller can
  // surface the conflict rather than silently auto-renumbering.
  let nextSlug = cur.slug;
  if (patch.slug && patch.slug !== cur.slug) {
    const desired = slugify(patch.slug) || cur.slug;
    const idx = await readSlugIndex(storage, a, c, siteId);
    if (idx[desired] && idx[desired] !== id) throw new BlogSlugConflictError(desired);
    delete idx[cur.slug];
    idx[desired] = id;
    await writeSlugIndex(storage, a, c, siteId, idx);
    nextSlug = desired;
  }

  const nextStatus = patch.status ?? cur.status;
  const becomesPublished = nextStatus === "published" && cur.status !== "published";

  const next: BlogPost = {
    ...cur,
    ...(patch.title != null ? { title: patch.title.trim() || cur.title } : {}),
    slug: nextSlug,
    ...(patch.body ? { body: patch.body } : {}),
    ...(patch.excerpt != null ? { excerpt: patch.excerpt } : {}),
    ...(patch.coverImg != null ? { coverImg: patch.coverImg } : {}),
    ...(patch.tags ? { tags: patch.tags } : {}),
    ...(patch.author != null ? { author: patch.author } : {}),
    status: nextStatus,
    ...(becomesPublished ? { publishedAt: now } : {}),
    updatedAt: now,
  };
  await storage.set(storageKeys.blogPost(a, c, siteId, id), next);
  return next;
}

export async function deleteBlogPost(
  storage: PluginStorage, a: AgencyId, c: ClientId, siteId: string, id: string,
): Promise<boolean> {
  const cur = await getBlogPost(storage, a, c, siteId, id);
  if (!cur) return false;
  await storage.del(storageKeys.blogPost(a, c, siteId, id));
  const ids = await readPostIndex(storage, a, c, siteId);
  await writePostIndex(storage, a, c, siteId, ids.filter(x => x !== id));
  const idx = await readSlugIndex(storage, a, c, siteId);
  delete idx[cur.slug];
  await writeSlugIndex(storage, a, c, siteId, idx);
  return true;
}
