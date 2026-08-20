# `src/built-ins/modules/website-editor/src/server/blog.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R008 — Blog posts. Per-site CRUD scoped by (agencyId, clientId, siteId). Body is a `Block[]` BlockTree so posts can use any block from the catalogue (richer than the 02 portal's HTML-only body — chapter §1 contract).  Slug uniqueness is enforced via a slug→id sidecar index so `/blog/[slug]` lookups are O(1) without scanning the full post list.

## Exports (12)

- `type BlogPostStatus`
- `interface BlogPost (15 members)`
- `interface CreateBlogPostInput (11 members)`
- `interface UpdateBlogPostPatch (8 members)`
- `interface ListBlogPostsFilter (4 members)`
- `class BlogSlugConflictError`
    - `constructor(public readonly slug: string)`
- `async createBlogPost(storage: PluginStorage, input: CreateBlogPostInput): Promise<BlogPost>`
- `async getBlogPost(storage: PluginStorage, a: AgencyId, c: ClientId, siteId: string, id: string): Promise<BlogPost | null>`
- `async getBlogPostBySlug(storage: PluginStorage, a: AgencyId, c: ClientId, siteId: string, slug: string): Promise<BlogPost | null>`
- `async listBlogPosts(storage: PluginStorage, a: AgencyId, c: ClientId, siteId: string, filter: ListBlogPostsFilter = {}): Promise<BlogPost[]>`
- `async updateBlogPost(storage: PluginStorage, a: AgencyId, c: ClientId, siteId: string, id: string, patch: UpdateBlogPostPatch): Promise<BlogPost | null>`
- `async deleteBlogPost(storage: PluginStorage, a: AgencyId, c: ClientId, siteId: string, id: string): Promise<boolean>`

## Depends on (5)

- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/website-editor/src/server/storage-keys.ts`](./storage-keys.md)
- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/__smoke__/r008-blog.test.ts`](../__smoke__/r008-blog.test.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/blog.ts`](../api/handlers/blog.md)

