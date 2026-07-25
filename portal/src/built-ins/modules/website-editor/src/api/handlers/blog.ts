// R008 — Blog admin + storefront handlers.

import type { PluginCtx } from "../../lib/aquaPluginTypes";
import type { Block } from "../../types/block";
import {
  createBlogPost,
  getBlogPost,
  getBlogPostBySlug,
  listBlogPosts,
  updateBlogPost,
  deleteBlogPost,
  BlogSlugConflictError,
  type BlogPostStatus,
  type ListBlogPostsFilter,
} from "../../server/blog";
import { fail, ok, readJsonBody, readQuery, requireClientScope } from "../helpers";

// GET /blog/posts?siteId=...&status=...&tag=...&q=...&limit=...
export async function handleListBlogPosts(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  if (!q.siteId) return fail("siteId required", 400);
  const filter: ListBlogPostsFilter = {};
  if (q.status) filter.status = q.status as BlogPostStatus | "all";
  if (q.tag) filter.tag = q.tag;
  if (q.q) filter.query = q.q;
  if (q.limit) filter.limit = Number(q.limit);
  const posts = await listBlogPosts(ctx.storage, scope.agencyId, scope.clientId, q.siteId, filter);
  return ok({ posts });
}

// GET /blog/posts/get?siteId=...&id=...
export async function handleGetBlogPost(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  if (!q.siteId) return fail("siteId required", 400);
  if (!q.id) return fail("id required", 400);
  const post = await getBlogPost(ctx.storage, scope.agencyId, scope.clientId, q.siteId, q.id);
  if (!post) return fail("post not found", 404);
  return ok({ post });
}

// GET /blog/posts/by-slug?siteId=...&slug=...
export async function handleGetBlogPostBySlug(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  if (!q.siteId) return fail("siteId required", 400);
  if (!q.slug) return fail("slug required", 400);
  const post = await getBlogPostBySlug(ctx.storage, scope.agencyId, scope.clientId, q.siteId, q.slug);
  if (!post) return fail("post not found", 404);
  if (post.status === "archived") return fail("post archived", 404);
  return ok({ post });
}

// POST /blog/posts — body { siteId, title, slug?, body?, excerpt?, coverImg?, tags?, author?, status? }
export async function handleCreateBlogPost(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const body = await readJsonBody<{
    siteId?: string; title?: string; slug?: string; body?: Block[];
    excerpt?: string; coverImg?: string; tags?: string[]; author?: string;
    status?: BlogPostStatus;
  }>(req);
  if (!body?.siteId) return fail("siteId required", 400);
  if (!body.title) return fail("title required", 400);
  const post = await createBlogPost(ctx.storage, {
    agencyId: scope.agencyId,
    clientId: scope.clientId,
    siteId: body.siteId,
    title: body.title,
    ...(body.slug ? { slug: body.slug } : {}),
    ...(body.body ? { body: body.body } : {}),
    ...(body.excerpt ? { excerpt: body.excerpt } : {}),
    ...(body.coverImg ? { coverImg: body.coverImg } : {}),
    ...(body.tags ? { tags: body.tags } : {}),
    ...(body.author ? { author: body.author } : {}),
    ...(body.status ? { status: body.status } : {}),
  });
  return ok({ post }, { status: 201 });
}

// PATCH /blog/posts?siteId=...&id=...  body: UpdateBlogPostPatch
export async function handleUpdateBlogPost(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  if (!q.siteId) return fail("siteId required", 400);
  if (!q.id) return fail("id required", 400);
  const body = await readJsonBody<{
    title?: string; slug?: string; body?: Block[]; excerpt?: string;
    coverImg?: string; tags?: string[]; author?: string; status?: BlogPostStatus;
  }>(req);
  if (!body) return fail("body required", 400);
  try {
    const next = await updateBlogPost(ctx.storage, scope.agencyId, scope.clientId, q.siteId, q.id, body);
    if (!next) return fail("post not found", 404);
    return ok({ post: next });
  } catch (e) {
    if (e instanceof BlogSlugConflictError) {
      return fail(`slug already in use: ${e.slug}`, 409);
    }
    throw e;
  }
}

// DELETE /blog/posts?siteId=...&id=...
export async function handleDeleteBlogPost(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  if (!q.siteId) return fail("siteId required", 400);
  if (!q.id) return fail("id required", 400);
  const removed = await deleteBlogPost(ctx.storage, scope.agencyId, scope.clientId, q.siteId, q.id);
  if (!removed) return fail("post not found", 404);
  return ok({ id: q.id });
}
