// Smoke — R008 Storefront blog admin.
//
// Tests the blog server module + handler shapes + blockRegistry
// surfaces for `blog-feed` and `blog-post`.

import {
  createBlogPost,
  getBlogPost,
  getBlogPostBySlug,
  listBlogPosts,
  updateBlogPost,
  deleteBlogPost,
  BlogSlugConflictError,
} from "../server/blog";
import {
  handleListBlogPosts,
  handleGetBlogPost,
  handleGetBlogPostBySlug,
  handleCreateBlogPost,
  handleUpdateBlogPost,
  handleDeleteBlogPost,
} from "../api/handlers/blog";
import { getBlockDefinition } from "../components/blockRegistry";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { Block } from "../types/block";
import type { AgencyId, ClientId } from "../lib/tenancy";

function memStorage(): PluginStorage {
  const m = new Map<string, unknown>();
  return {
    async get<T>(k: string) { return m.get(k) as T | undefined; },
    async set(k, v) { m.set(k, v); },
    async del(k) { m.delete(k); },
    async list(prefix = "") { return [...m.keys()].filter(k => k.startsWith(prefix)); },
  };
}

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

const a = "ag_smoke" as AgencyId;
const c = "cl_smoke" as ClientId;
const siteId = "site_smoke";
const BODY: Block[] = [
  { id: "h1", type: "heading", props: { text: "Hello", level: 1 } },
  { id: "p1", type: "text", props: { text: "Welcome." } },
];

(async () => {
  // ─── block registry ──────────────────────────────────────────────────────
  const feedDef = getBlockDefinition("blog-feed");
  expect("blog-feed registered", !!feedDef);
  expect("blog-feed default count is 6",
    feedDef?.defaultProps.count === 6);
  expect("blog-feed layout field is select",
    Array.isArray(feedDef?.fields) && feedDef!.fields!.some(f => f.key === "layout" && f.type === "select"));
  const postDef = getBlockDefinition("blog-post");
  expect("blog-post registered", !!postDef);
  expect("blog-post default slug is 'auto'",
    postDef?.defaultProps.slug === "auto");

  // ─── server CRUD ─────────────────────────────────────────────────────────
  const storage = memStorage();
  const p1 = await createBlogPost(storage, {
    agencyId: a, clientId: c, siteId,
    title: "First post", body: BODY,
    excerpt: "First excerpt", tags: ["news", "launch"],
    status: "draft",
  });
  expect("createBlogPost id starts with post_", p1.id.startsWith("post_"));
  expect("createBlogPost slug derived from title",
    p1.slug === "first-post");
  expect("createBlogPost defaults status=draft", p1.status === "draft");
  expect("publishedAt unset on draft", p1.publishedAt === undefined);

  // Slug uniqueness — second post with same title gets -2 suffix.
  const p2 = await createBlogPost(storage, {
    agencyId: a, clientId: c, siteId,
    title: "First post", body: [],
  });
  expect("second 'First post' slug auto-disambiguates to first-post-2",
    p2.slug === "first-post-2");

  // Explicit slug honoured.
  const p3 = await createBlogPost(storage, {
    agencyId: a, clientId: c, siteId,
    title: "Third", slug: "custom-slug", body: [], tags: ["news"],
    status: "published",
  });
  expect("explicit slug honoured", p3.slug === "custom-slug");
  expect("createBlogPost(status:'published') sets publishedAt",
    typeof p3.publishedAt === "number");

  // by-slug lookup
  const fetched = await getBlogPostBySlug(storage, a, c, siteId, "custom-slug");
  expect("getBlogPostBySlug returns the right post",
    fetched?.id === p3.id);
  const missing = await getBlogPostBySlug(storage, a, c, siteId, "no-such-slug");
  expect("getBlogPostBySlug returns null for unknown slug", missing === null);

  // list — defaults exclude archived; published before drafts.
  const list = await listBlogPosts(storage, a, c, siteId);
  expect("listBlogPosts returns 3 (none archived yet)", list.length === 3);
  expect("listBlogPosts puts published p3 first",
    list[0]!.id === p3.id);
  expect("drafts ordered by updatedAt after published",
    list[1]!.status === "draft" && list[2]!.status === "draft");

  // status filter
  const drafts = await listBlogPosts(storage, a, c, siteId, { status: "draft" });
  expect("status:'draft' returns only drafts",
    drafts.length === 2 && drafts.every(p => p.status === "draft"));
  const published = await listBlogPosts(storage, a, c, siteId, { status: "published" });
  expect("status:'published' returns only p3",
    published.length === 1 && published[0]!.id === p3.id);

  // tag filter
  const news = await listBlogPosts(storage, a, c, siteId, { tag: "news" });
  expect("tag:'news' narrows to p1 + p3 (both tagged 'news')",
    news.length === 2);
  const launch = await listBlogPosts(storage, a, c, siteId, { tag: "launch" });
  expect("tag:'launch' narrows to p1 only", launch.length === 1 && launch[0]!.id === p1.id);

  // search query
  const q = await listBlogPosts(storage, a, c, siteId, { query: "third" });
  expect("query:'third' matches p3 by title", q.length === 1 && q[0]!.id === p3.id);

  // limit
  const lim = await listBlogPosts(storage, a, c, siteId, { limit: 2 });
  expect("limit:2 caps result", lim.length === 2);

  // ─── status transitions ─────────────────────────────────────────────────
  const updPub = await updateBlogPost(storage, a, c, siteId, p1.id, { status: "published" });
  expect("draft → published sets publishedAt",
    updPub?.status === "published" && typeof updPub?.publishedAt === "number");

  const updArch = await updateBlogPost(storage, a, c, siteId, p1.id, { status: "archived" });
  expect("published → archived honoured", updArch?.status === "archived");

  const listAfterArchive = await listBlogPosts(storage, a, c, siteId);
  expect("default list hides archived",
    listAfterArchive.every(p => p.status !== "archived"));
  const allWithArchived = await listBlogPosts(storage, a, c, siteId, { status: "all" });
  expect("status:'all' surfaces archived",
    allWithArchived.some(p => p.status === "archived"));

  // by-slug rejects archived (404 from handler)
  const archivedBySlug = await getBlogPostBySlug(storage, a, c, siteId, "first-post");
  expect("getBlogPostBySlug returns archived post (handler is the 404 gate)",
    archivedBySlug?.status === "archived");

  // ─── slug conflict on update ────────────────────────────────────────────
  let conflict: unknown = null;
  try {
    await updateBlogPost(storage, a, c, siteId, p2.id, { slug: "custom-slug" });
  } catch (e) { conflict = e; }
  expect("updateBlogPost slug conflict throws BlogSlugConflictError",
    conflict instanceof BlogSlugConflictError);

  // Slug change to unused value succeeds + swaps slug index.
  const renamed = await updateBlogPost(storage, a, c, siteId, p2.id, { slug: "Renamed Slug!" });
  expect("updateBlogPost slugifies new slug", renamed?.slug === "renamed-slug");
  expect("old slug freed",
    (await getBlogPostBySlug(storage, a, c, siteId, "first-post-2")) === null);
  expect("new slug routes to p2",
    (await getBlogPostBySlug(storage, a, c, siteId, "renamed-slug"))?.id === p2.id);

  // ─── delete ─────────────────────────────────────────────────────────────
  const del = await deleteBlogPost(storage, a, c, siteId, p2.id);
  expect("deleteBlogPost returns true on hit", del === true);
  const delMiss = await deleteBlogPost(storage, a, c, siteId, "post_nope");
  expect("deleteBlogPost returns false on miss", delMiss === false);
  expect("getBlogPost returns null after delete",
    (await getBlogPost(storage, a, c, siteId, p2.id)) === null);

  // ─── HTTP handlers ──────────────────────────────────────────────────────
  const ctxStorage = memStorage();
  const ctx = {
    agencyId: a, clientId: c, actor: "u_smoke",
    storage: ctxStorage,
    services: {} as Record<string, unknown>,
    install: { config: {} },
  } as unknown as Parameters<typeof handleCreateBlogPost>[1];

  // POST 201
  const createRes = await handleCreateBlogPost(new Request("http://x/blog/posts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      siteId, title: "Handler post", body: BODY,
      tags: ["t1"], status: "published",
    }),
  }), ctx);
  expect("POST /blog/posts 201", createRes.status === 201);
  const createBody = await createRes.json() as { ok: boolean; post: { id: string; slug: string } };
  expect("POST returns post.id + slug",
    !!createBody.post.id && createBody.post.slug === "handler-post");

  // POST 400 missing title
  const badPost = await handleCreateBlogPost(new Request("http://x/blog/posts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ siteId }),
  }), ctx);
  expect("POST without title → 400", badPost.status === 400);

  // GET list
  const listRes = await handleListBlogPosts(
    new Request(`http://x/blog/posts?siteId=${siteId}`), ctx,
  );
  expect("GET /blog/posts 200", listRes.status === 200);
  const listBody = await listRes.json() as { ok: boolean; posts: unknown[] };
  expect("GET surfaces 1 post", listBody.posts.length === 1);

  // GET by-slug 200
  const slugRes = await handleGetBlogPostBySlug(
    new Request(`http://x/blog/posts/by-slug?siteId=${siteId}&slug=handler-post`), ctx,
  );
  expect("GET by-slug 200", slugRes.status === 200);

  // GET by-slug 404 unknown
  const slug404 = await handleGetBlogPostBySlug(
    new Request(`http://x/blog/posts/by-slug?siteId=${siteId}&slug=missing`), ctx,
  );
  expect("GET by-slug unknown → 404", slug404.status === 404);

  // PATCH 200 + 404 + 409
  const patch200 = await handleUpdateBlogPost(
    new Request(`http://x/blog/posts?siteId=${siteId}&id=${createBody.post.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Updated title" }),
    }), ctx,
  );
  expect("PATCH /blog/posts 200", patch200.status === 200);

  const patch404 = await handleUpdateBlogPost(
    new Request(`http://x/blog/posts?siteId=${siteId}&id=post_nope`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Whatever" }),
    }), ctx,
  );
  expect("PATCH unknown id → 404", patch404.status === 404);

  // Create a second post to test slug conflict from the handler.
  await handleCreateBlogPost(new Request("http://x/blog/posts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ siteId, title: "Sibling" }),
  }), ctx);
  const conflictRes = await handleUpdateBlogPost(
    new Request(`http://x/blog/posts?siteId=${siteId}&id=${createBody.post.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "sibling" }),
    }), ctx,
  );
  expect("PATCH slug conflict → 409", conflictRes.status === 409);

  // DELETE
  const delRes = await handleDeleteBlogPost(
    new Request(`http://x/blog/posts?siteId=${siteId}&id=${createBody.post.id}`, { method: "DELETE" }), ctx,
  );
  expect("DELETE /blog/posts 200", delRes.status === 200);

  const delMissRes = await handleDeleteBlogPost(
    new Request(`http://x/blog/posts?siteId=${siteId}&id=post_nope`, { method: "DELETE" }), ctx,
  );
  expect("DELETE unknown id → 404", delMissRes.status === 404);

  // GET archived post via handler returns 404 (storefront gate).
  await handleCreateBlogPost(new Request("http://x/blog/posts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ siteId, title: "Archive me", slug: "archive-me", status: "archived" }),
  }), ctx);
  const archivedRes = await handleGetBlogPostBySlug(
    new Request(`http://x/blog/posts/by-slug?siteId=${siteId}&slug=archive-me`), ctx,
  );
  expect("GET by-slug archived → 404 from handler", archivedRes.status === 404);

  // GET admin can still see archived via id
  const adminListAll = await handleListBlogPosts(
    new Request(`http://x/blog/posts?siteId=${siteId}&status=all`), ctx,
  );
  const adminListAllBody = await adminListAll.json() as { posts: { status: string }[] };
  expect("admin list status=all surfaces archived",
    adminListAllBody.posts.some(p => p.status === "archived"));

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
