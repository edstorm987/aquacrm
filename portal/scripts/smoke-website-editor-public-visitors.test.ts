import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { withRequestScope } from "./dev-console-request-scope";

import {
  handleVisitorBlogPost,
  handleVisitorBlogPosts,
  handleVisitorContact,
  handleListVisitorContacts,
  type VisitorContactSubmission,
} from "../src/built-ins/modules/website-editor/src/api/handlers/visitor";
import type {
  PluginCtx,
  PluginStorage,
} from "../src/built-ins/modules/website-editor/src/lib/aquaPluginTypes";
import {
  BlogPostBodyValidationError,
  createBlogPost,
  updateBlogPost,
} from "../src/built-ins/modules/website-editor/src/server/blog";
import {
  createPage,
  getPublishedPageBySlug,
  publishPage,
  revertPage,
  updatePage,
} from "../src/built-ins/modules/website-editor/src/server/pages";
import { createSite, updateSite } from "../src/built-ins/modules/website-editor/src/server/sites";
import { createTheme, updateTheme } from "../src/built-ins/modules/website-editor/src/server/themes";
import { resolveStorefrontTree } from "../src/built-ins/modules/website-editor/src/lib/draftPublished";
import {
  resolvePublishedPage,
  resolvePublishedTheme,
} from "../src/built-ins/modules/website-editor/src/lib/pagePublication";
import {
  BLOG_POST_BODY_MAX_DEPTH,
  validateBlogPostBody,
} from "../src/built-ins/modules/website-editor/src/lib/blogPostBody";
import { storageKeys } from "../src/built-ins/modules/website-editor/src/server/storage-keys";
import {
  exportSiteToZip,
  renderPageHtml,
} from "../src/built-ins/modules/website-editor/src/server/staticExport";
import { parseVisitorContactReceipt } from "../src/built-ins/modules/website-editor/src/lib/visitorContactReceipt";
import {
  normaliseVisitorContactConsentStatement,
  visitorContactConsentDigest,
} from "../src/built-ins/modules/website-editor/src/lib/visitorContactConsent";

const AGENCY = "agency_public_visitors";
const CLIENT = "client_public_visitors";
const ORIGIN = "https://portal.example.test";
const CONSENT_STATEMENT = "I agree to a reply about this request.";
const CONSENT_STATEMENT_DIGEST =
  "sha256:86673868983e605a924bffa16549fdcc7d0727c33a77ddb0f3f23fdfcff13483";

function memoryStorage(exclusive = true): PluginStorage {
  const data = new Map<string, unknown>();
  return {
    async get<T>(key: string) { return data.get(key) as T | undefined; },
    async set<T>(key: string, value: T) { data.set(key, value); },
    async del(key: string) { data.delete(key); },
    async list(prefix = "") { return [...data.keys()].filter(key => key.startsWith(prefix)); },
    ...(exclusive ? { async runExclusive<T>(_key: string, operation: () => Promise<T>) { return operation(); } } : {}),
  };
}

function context(storage = memoryStorage(), agencyId = AGENCY, clientId = CLIENT): PluginCtx {
  return {
    agencyId,
    clientId,
    actor: "anonymous",
    storage,
    services: {} as PluginCtx["services"],
    install: { id: `install_${agencyId}_${clientId}`, pluginId: "website-editor" } as PluginCtx["install"],
  };
}

async function fixture(ctx = context(), published = true) {
  const site = await createSite(ctx.storage, {
    agencyId: ctx.agencyId,
    clientId: ctx.clientId!,
    name: "Visitor site",
    slug: "visitor-site",
  });
  const page = await createPage(ctx.storage, {
    agencyId: ctx.agencyId,
    clientId: ctx.clientId!,
    siteId: site.id,
    title: "Contact",
    slug: "contact",
    blocks: [{
      id: "contact_block",
      type: "contact-form",
      props: {
        formName: "Website contact",
        consentLabel: CONSENT_STATEMENT,
        consentVersion: 3,
      },
    }],
  });
  if (published) await publishPage(ctx.storage, ctx.agencyId, ctx.clientId!, site.id, page.id);
  return { ctx, site, page };
}

function contactBody(siteId: string, pageId: string, operationId = "contact_operation_0001") {
  return {
    version: 1,
    operationId,
    siteId,
    pageId,
    blockId: "contact_block",
    contact: {
      name: "Visitor Name",
      email: "visitor@example.test",
      phone: "+44 7700 900123",
      message: "Please call me about the project.",
    },
    consent: {
      agreed: true,
      purpose: "contact-request",
      version: 3,
      statementDigest: CONSENT_STATEMENT_DIGEST,
    },
    website: "",
  };
}

async function post(ctx: PluginCtx, body: unknown, origin = ORIGIN, ip = "198.51.100.20") {
  return handleVisitorContact(new Request(`${ORIGIN}/api/portal/website-editor/visitor/contact`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      referer: `${origin}/contact?private=discarded`,
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  }), ctx);
}

async function getBlogPost(ctx: PluginCtx, siteId: string, slug: string, ip = "198.51.100.21") {
  const params = new URLSearchParams({
    agencyId: ctx.agencyId,
    clientId: ctx.clientId!,
    siteId,
    slug,
  });
  return handleVisitorBlogPost(new Request(
    `${ORIGIN}/api/portal/website-editor/public/blog/posts/by-slug?${params.toString()}`,
    { headers: { "x-forwarded-for": ip } },
  ), ctx);
}

test("route manifest exposes visitor facades without widening operator routes", () => {
  const source = readFileSync(
    new URL("../src/built-ins/modules/website-editor/src/api/routes.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /path:\s*["']visitor\/contact["'][^}]*public:\s*true/s);
  assert.match(source, /path:\s*["']public\/blog\/posts["'][^}]*public:\s*true/s);
  assert.match(source, /path:\s*["']public\/blog\/posts\/by-slug["'][^}]*public:\s*true/s);
  for (const path of ["/forms/submit", "/forms/webhook-log", "/forms/contact-submissions", "/blog/posts", "/blog/posts/by-slug"]) {
    const row = source.match(new RegExp(`\\{\\s*path:\\s*["']${path.replaceAll("/", "\\/")}["'][^}]*\\}`, "s"))?.[0] ?? "";
    assert.ok(row, `${path} route missing`);
    assert.doesNotMatch(row, /public:\s*true/, `${path} operator route became public`);
  }
});

test("visitor blocks activate only on a published mount, never the editor or draft preview", () => {
  const renderer = readFileSync(
    new URL("../src/built-ins/modules/website-editor/src/components/storefront/PortalPageRenderer.tsx", import.meta.url),
    "utf8",
  );
  const contact = readFileSync(
    new URL("../src/built-ins/modules/website-editor/src/components/blocks/ContactFormBlock.tsx", import.meta.url),
    "utf8",
  );
  const blog = readFileSync(
    new URL("../src/built-ins/modules/website-editor/src/components/blocks/BlogFeedBlock.tsx", import.meta.url),
    "utf8",
  );
  const blogPost = readFileSync(
    new URL("../src/built-ins/modules/website-editor/src/components/blocks/BlogPostBlock.tsx", import.meta.url),
    "utf8",
  );

  assert.match(renderer, /resolveStorefrontTree\(page,\s*\{\s*preview\s*\}\)/);
  assert.match(renderer, /preview\s*\?\s*page\s*:\s*resolvePublishedPage\(page\)/);
  assert.match(renderer, /data-portal-role=\{renderedPage\.portalRole\s*\?\?\s*["']page["']\}/);
  assert.match(renderer, /customCSS=\{renderedPage\.customCss\s*\?\?\s*renderedPage\.customCSS\}/);
  assert.match(renderer, /publishedWebsite:\s*preview\s*!==\s*true\s*&&\s*resolved\.source\s*===\s*["']published["']/);
  assert.doesNotMatch(renderer, /blocks=\{page\.blocks\}/, "storefront bypasses the published snapshot resolver");
  assert.match(contact, /context\.publishedWebsite\s*===\s*true/);
  assert.match(blog, /context\.publishedWebsite\s*!==\s*true/);
  assert.match(blogPost, /context\?\.publishedWebsite\s*===\s*true/);
  assert.match(blogPost, /new URLSearchParams\(\{\s*agencyId,\s*clientId,\s*siteId,\s*slug\s*\}\)/);
  assert.match(blogPost, /public\/blog\/posts\/by-slug/);
  assert.match(blogPost, /renderChildren\(post\.body\)/);
  assert.doesNotMatch(blogPost, /__aquaRenderBlocks|JSON\.stringify\(post\.body/);
});

test("published storefront keeps an immutable snapshot across edit, revert and republish", async () => {
  const storage = memoryStorage();
  const site = await createSite(storage, {
    agencyId: AGENCY,
    clientId: CLIENT,
    name: "Published snapshot site",
    slug: "published-snapshot-site",
  });
  const liveTree = [{ id: "live_heading", type: "heading", props: { text: "Live copy" } }];
  const draftTree = [{ id: "draft_heading", type: "heading", props: { text: "Draft copy" } }];
  const page = await createPage(storage, {
    agencyId: AGENCY,
    clientId: CLIENT,
    siteId: site.id,
    title: "Snapshot page",
    blocks: liveTree,
  });

  const published = await publishPage(storage, AGENCY, CLIENT, site.id, page.id);
  assert.deepEqual(published?.publishedBlocks, liveTree, "publishing records an explicit live snapshot");

  const edited = await updatePage(storage, AGENCY, CLIENT, site.id, page.id, { blocks: draftTree });
  assert.deepEqual(edited?.blocks, draftTree, "the editor keeps the new working tree");
  assert.deepEqual(edited?.publishedBlocks, liveTree, "editing cannot replace the live snapshot");
  assert.deepEqual(resolveStorefrontTree(edited!).tree, liveTree, "ordinary storefront serves the snapshot");
  assert.deepEqual(resolveStorefrontTree(edited!, { preview: true }).tree, draftTree, "preview serves the working tree");

  const reverted = await revertPage(storage, AGENCY, CLIENT, site.id, page.id);
  assert.deepEqual(reverted?.blocks, liveTree, "revert restores the published tree into the editor");

  const editedAgain = await updatePage(storage, AGENCY, CLIENT, site.id, page.id, { blocks: draftTree });
  assert.ok(editedAgain);
  const republished = await publishPage(storage, AGENCY, CLIENT, site.id, page.id);
  assert.deepEqual(republished?.publishedBlocks, draftTree, "republish promotes the latest working tree");
  assert.deepEqual(resolveStorefrontTree(republished!).tree, draftTree);
});

test("publication snapshot gates presentation, metadata, custom code and privacy until publish", async () => {
  const storage = memoryStorage();
  const site = await createSite(storage, {
    agencyId: AGENCY,
    clientId: CLIENT,
    name: "Complete publication site",
    slug: "complete-publication-site",
  });
  const liveTheme = await createTheme(storage, {
    agencyId: AGENCY,
    clientId: CLIENT,
    siteId: site.id,
    name: "Live theme",
    tokens: { primary: "#0011aa", ink: "#ffffff" },
  });
  const draftTheme = await createTheme(storage, {
    agencyId: AGENCY,
    clientId: CLIENT,
    siteId: site.id,
    name: "Draft theme",
    tokens: { primary: "#dd2200", ink: "#111111" },
  });
  const page = await createPage(storage, {
    agencyId: AGENCY,
    clientId: CLIENT,
    siteId: site.id,
    slug: "live-route",
    title: "Live title",
    description: "Live description",
    themeId: liveTheme.id,
    blocks: [{ id: "live", type: "heading", props: { text: "Live" } }],
  });
  await updatePage(storage, AGENCY, CLIENT, site.id, page.id, {
    isHomepage: true,
    portalRole: "login",
    isActivePortal: true,
    privacy: "password",
    passwordHash: "sha256:live",
    customCSS: ".live-alias{}",
    customCss: ".live{}",
    customHead: "<meta name=\"live-head\">",
    customFoot: "<p>live foot</p>",
    headInjection: "window.live=true",
    layoutOverrides: { hideNav: true },
    seo: { metaTitle: "Live SEO", metaDescription: "Live SEO description", noIndex: true },
  });
  const published = await publishPage(storage, AGENCY, CLIENT, site.id, page.id);
  assert.equal(published?.publishedPage?.version, 2);
  const editedThemeRecord = await updateTheme(storage, AGENCY, CLIENT, site.id, liveTheme.id, {
    tokens: { primary: "#ff00ff" },
  });
  assert.equal(
    resolvePublishedTheme(published!, editedThemeRecord)?.tokens.primary,
    "#0011aa",
    "editing a referenced theme record cannot change a published page",
  );

  const draftPatch = {
    slug: "draft-route",
    title: "Draft title",
    description: "Draft description",
    isHomepage: false,
    portalRole: "account" as const,
    isActivePortal: false,
    privacy: "public" as const,
    passwordHash: undefined,
    themeId: draftTheme.id,
    customCSS: ".draft-alias{}",
    customCss: ".draft{}",
    customHead: "<meta name=\"draft-head\">",
    customFoot: "<p>draft foot</p>",
    headInjection: "window.draft=true",
    layoutOverrides: { hideFooter: true },
    seo: { metaTitle: "Draft SEO", metaDescription: "Draft SEO description", noIndex: false },
  };
  const edited = await updatePage(storage, AGENCY, CLIENT, site.id, page.id, draftPatch);
  assert.equal(edited?.title, "Draft title", "editor should retain the draft presentation");
  const live = resolvePublishedPage(edited!);
  assert.equal(
    (await getPublishedPageBySlug(storage, AGENCY, CLIENT, site.id, "live-route"))?.id,
    page.id,
  );
  assert.equal(
    await getPublishedPageBySlug(storage, AGENCY, CLIENT, site.id, "draft-route"),
    null,
  );
  const forged = await updatePage(storage, AGENCY, CLIENT, site.id, page.id, {
    publishedBlocks: [{ id: "forged", type: "heading", props: { text: "Forged" } }],
    publishedPage: { version: 1, slug: "forged", title: "Forged" },
  } as never);
  assert.equal(resolvePublishedPage(forged!).title, "Live title");
  assert.deepEqual(resolveStorefrontTree(forged!).tree, [{ id: "live", type: "heading", props: { text: "Live" } }]);
  assert.deepEqual({
    slug: live.slug,
    title: live.title,
    description: live.description,
    isHomepage: live.isHomepage,
    portalRole: live.portalRole,
    isActivePortal: live.isActivePortal,
    privacy: live.privacy,
    passwordHash: live.passwordHash,
    themeId: live.themeId,
    customCSS: live.customCSS,
    customCss: live.customCss,
    customHead: live.customHead,
    customFoot: live.customFoot,
    headInjection: live.headInjection,
    layoutOverrides: live.layoutOverrides,
    seo: live.seo,
  }, {
    slug: "live-route",
    title: "Live title",
    description: "Live description",
    isHomepage: true,
    portalRole: "login",
    isActivePortal: true,
    privacy: "password",
    passwordHash: "sha256:live",
    themeId: liveTheme.id,
    customCSS: ".live-alias{}",
    customCss: ".live{}",
    customHead: "<meta name=\"live-head\">",
    customFoot: "<p>live foot</p>",
    headInjection: "window.live=true",
    layoutOverrides: { hideNav: true },
    seo: { metaTitle: "Live SEO", metaDescription: "Live SEO description", noIndex: true },
  });
  const exportedHtml = renderPageHtml(edited!, { brandCssHref: "assets/brand.css" });
  assert.match(exportedHtml, /<title>Live SEO<\/title>/);
  assert.match(exportedHtml, /Live SEO description/);
  assert.doesNotMatch(exportedHtml, /Draft SEO|Draft description/);

  const reverted = await revertPage(storage, AGENCY, CLIENT, site.id, page.id);
  assert.equal(reverted?.title, "Live title");
  assert.equal(reverted?.portalRole, "login");
  assert.equal(reverted?.isActivePortal, true);
  assert.equal(reverted?.privacy, "password");
  assert.deepEqual(reverted?.seo, { metaTitle: "Live SEO", metaDescription: "Live SEO description", noIndex: true });

  await updatePage(storage, AGENCY, CLIENT, site.id, page.id, draftPatch);
  const republished = await publishPage(storage, AGENCY, CLIENT, site.id, page.id);
  assert.equal(resolvePublishedPage(republished!).title, "Draft title");
  assert.equal(resolvePublishedPage(republished!).portalRole, "account");
  assert.equal(resolvePublishedPage(republished!).isActivePortal, false);
  assert.equal(resolvePublishedPage(republished!).privacy, "public");
  assert.equal(resolvePublishedPage(republished!).passwordHash, undefined);
  assert.equal(resolvePublishedPage(republished!).seo?.metaTitle, "Draft SEO");
  assert.equal(resolvePublishedTheme(republished!, null)?.id, draftTheme.id);
  assert.equal(resolvePublishedTheme(republished!, null)?.tokens.primary, "#dd2200");
  assert.equal(
    (await getPublishedPageBySlug(storage, AGENCY, CLIENT, site.id, "draft-route"))?.id,
    page.id,
  );
});

test("first edit of a legacy published row snapshots its pre-edit live tree", async () => {
  const storage = memoryStorage();
  const site = await createSite(storage, {
    agencyId: AGENCY,
    clientId: CLIENT,
    name: "Legacy snapshot site",
    slug: "legacy-snapshot-site",
  });
  const liveTree = [{ id: "legacy_live", type: "heading", props: { text: "Legacy live copy" } }];
  const draftTree = [{ id: "legacy_draft", type: "heading", props: { text: "Unpublished edit" } }];
  const page = await createPage(storage, {
    agencyId: AGENCY,
    clientId: CLIENT,
    siteId: site.id,
    title: "Legacy page",
    blocks: liveTree,
  });
  await storage.set(storageKeys.page(AGENCY, CLIENT, site.id, page.id), {
    ...page,
    status: "published",
    publishedAt: Date.now() - 1_000,
    publishedBlocks: undefined,
  });

  const edited = await updatePage(storage, AGENCY, CLIENT, site.id, page.id, { blocks: draftTree });
  assert.deepEqual(edited?.publishedBlocks, liveTree, "migration-on-write preserves the legacy live tree");
  assert.deepEqual(resolveStorefrontTree(edited!).tree, liveTree);
  assert.deepEqual(resolveStorefrontTree(edited!, { preview: true }).tree, draftTree);
});

test("first presentation edit migrates a legacy published row before applying the draft", async () => {
  const storage = memoryStorage();
  const site = await createSite(storage, {
    agencyId: AGENCY,
    clientId: CLIENT,
    name: "Legacy presentation site",
    slug: "legacy-presentation-site",
  });
  const page = await createPage(storage, {
    agencyId: AGENCY,
    clientId: CLIENT,
    siteId: site.id,
    title: "Legacy live title",
    description: "Legacy live description",
    portalRole: "login",
    isActivePortal: true,
    blocks: [],
  });
  await storage.set(storageKeys.page(AGENCY, CLIENT, site.id, page.id), {
    ...page,
    status: "published",
    publishedAt: Date.now() - 1_000,
    publishedPage: undefined,
  });

  const edited = await updatePage(storage, AGENCY, CLIENT, site.id, page.id, {
    title: "Unpublished title",
    portalRole: "account",
    isActivePortal: false,
    privacy: "members-only",
  });
  assert.equal(edited?.publishedPage?.version, 2);
  assert.equal(resolvePublishedPage(edited!).title, "Legacy live title");
  assert.equal(resolvePublishedPage(edited!).description, "Legacy live description");
  assert.equal(resolvePublishedPage(edited!).portalRole, "login");
  assert.equal(resolvePublishedPage(edited!).isActivePortal, true);
  assert.equal(resolvePublishedPage(edited!).privacy, undefined);
});

test("version-1 snapshots migrate portal classification before the first edit", async () => {
  const storage = memoryStorage();
  const site = await createSite(storage, {
    agencyId: AGENCY,
    clientId: CLIENT,
    name: "Version one portal snapshot site",
    slug: "version-one-portal-site",
  });
  const page = await createPage(storage, {
    agencyId: AGENCY,
    clientId: CLIENT,
    siteId: site.id,
    title: "Legacy portal",
    portalRole: "login",
    isActivePortal: true,
    blocks: [],
  });
  const published = await publishPage(storage, AGENCY, CLIENT, site.id, page.id);
  assert.ok(published?.publishedPage);
  const legacySnapshot = { ...published.publishedPage } as Record<string, unknown>;
  legacySnapshot.version = 1;
  delete legacySnapshot.portalRole;
  delete legacySnapshot.isActivePortal;
  await storage.set(storageKeys.page(AGENCY, CLIENT, site.id, page.id), {
    ...published,
    publishedPage: legacySnapshot,
  });

  const edited = await updatePage(storage, AGENCY, CLIENT, site.id, page.id, {
    portalRole: "orders",
    isActivePortal: false,
  });
  assert.equal(edited?.publishedPage?.version, 2);
  assert.equal(resolvePublishedPage(edited!).portalRole, "login");
  assert.equal(resolvePublishedPage(edited!).isActivePortal, true);
  const reverted = await revertPage(storage, AGENCY, CLIENT, site.id, page.id);
  assert.equal(reverted?.portalRole, "login");
  assert.equal(reverted?.isActivePortal, true);
});

test("version-1 snapshot migration freezes the pre-edit published theme", async () => {
  const storage = memoryStorage();
  const site = await createSite(storage, {
    agencyId: AGENCY,
    clientId: CLIENT,
    name: "Version one theme snapshot site",
    slug: "version-one-theme-site",
  });
  const theme = await createTheme(storage, {
    agencyId: AGENCY,
    clientId: CLIENT,
    siteId: site.id,
    name: "Legacy published theme",
    tokens: { primary: "#123456", ink: "#ffffff" },
  });
  const page = await createPage(storage, {
    agencyId: AGENCY,
    clientId: CLIENT,
    siteId: site.id,
    title: "Legacy themed page",
    themeId: theme.id,
    blocks: [],
  });
  const published = await publishPage(storage, AGENCY, CLIENT, site.id, page.id);
  assert.ok(published?.publishedPage);
  const legacySnapshot = { ...published.publishedPage } as Record<string, unknown>;
  legacySnapshot.version = 1;
  delete legacySnapshot.theme;
  await storage.set(storageKeys.page(AGENCY, CLIENT, site.id, page.id), {
    ...published,
    publishedPage: legacySnapshot,
  });

  const migrated = await updatePage(storage, AGENCY, CLIENT, site.id, page.id, {
    title: "Unpublished title",
  });
  assert.equal(migrated?.publishedPage?.version, 2);
  assert.equal(migrated?.publishedPage?.theme?.tokens.primary, "#123456");

  const editedTheme = await updateTheme(storage, AGENCY, CLIENT, site.id, theme.id, {
    tokens: { primary: "#abcdef" },
  });
  assert.equal(
    resolvePublishedTheme(migrated!, editedTheme)?.tokens.primary,
    "#123456",
    "editing the current theme must not alter the migrated live publication",
  );
});

test("static export filters portal pages from the published snapshot, not draft classification", async () => {
  const storage = memoryStorage();
  const site = await createSite(storage, {
    agencyId: AGENCY,
    clientId: CLIENT,
    name: "Publication-aware export site",
    slug: "publication-aware-export",
  });
  const publicPage = await createPage(storage, {
    agencyId: AGENCY,
    clientId: CLIENT,
    siteId: site.id,
    title: "Published public page",
    slug: "published-public",
    blocks: [],
  });
  await publishPage(storage, AGENCY, CLIENT, site.id, publicPage.id);
  await updatePage(storage, AGENCY, CLIENT, site.id, publicPage.id, {
    portalRole: "login",
    isActivePortal: true,
  });

  const portalPage = await createPage(storage, {
    agencyId: AGENCY,
    clientId: CLIENT,
    siteId: site.id,
    title: "Published portal page",
    slug: "published-portal",
    portalRole: "login",
    isActivePortal: true,
    blocks: [],
  });
  await publishPage(storage, AGENCY, CLIENT, site.id, portalPage.id);
  await updatePage(storage, AGENCY, CLIENT, site.id, portalPage.id, {
    portalRole: undefined,
    isActivePortal: false,
  });

  const exported = await exportSiteToZip({
    storage,
    agencyId: AGENCY,
    clientId: CLIENT,
    siteId: site.id,
    baseUrl: "https://published.example.test",
  });
  const archiveText = new TextDecoder().decode(exported.zip);
  assert.equal(exported.pageCount, 1);
  assert.match(archiveText, /published-public\/index\.html/);
  assert.doesNotMatch(archiveText, /published-portal\/index\.html/);
});

test("serialized publication snapshots preserve intentionally absent live fields", async () => {
  const storage = memoryStorage();
  const site = await createSite(storage, {
    agencyId: AGENCY,
    clientId: CLIENT,
    name: "Serialized publication site",
    slug: "serialized-publication-site",
  });
  const page = await createPage(storage, {
    agencyId: AGENCY,
    clientId: CLIENT,
    siteId: site.id,
    title: "Published without extras",
    blocks: [],
  });
  const published = await publishPage(storage, AGENCY, CLIENT, site.id, page.id);
  const edited = await updatePage(storage, AGENCY, CLIENT, site.id, page.id, {
    description: "Draft description",
    customCss: ".draft{}",
    portalRole: "login",
    isActivePortal: true,
    privacy: "members-only",
    seo: { metaTitle: "Draft only" },
  });
  assert.ok(published && edited);
  const reloaded = JSON.parse(JSON.stringify(edited)) as typeof edited;
  const live = resolvePublishedPage(reloaded!);
  assert.equal(live.description, undefined);
  assert.equal(live.customCss, undefined);
  assert.equal(live.portalRole, undefined);
  assert.equal(live.isActivePortal, undefined);
  assert.equal(live.privacy, undefined);
  assert.equal(live.seo, undefined);
});

test("contact UI accepts only a parsed success receipt, not an arbitrary 2xx response", () => {
  assert.deepEqual(
    parseVisitorContactReceipt({ ok: true, receiptId: "contact_receipt_1" }),
    { ok: true, receiptId: "contact_receipt_1" },
  );
  for (const value of [null, {}, { ok: true }, { ok: false, receiptId: "contact_receipt_1" }, { ok: true, receiptId: "" }]) {
    assert.equal(parseVisitorContactReceipt(value), null);
  }
  const component = readFileSync(
    new URL("../src/built-ins/modules/website-editor/src/components/blocks/ContactFormBlock.tsx", import.meta.url),
    "utf8",
  );
  assert.match(component, /res\.ok\s*\?\s*parseVisitorContactReceipt\(reply\)\s*:\s*null/);
  assert.match(component, /visitorContactConsentDigest\(consentLabel\)/);
  assert.match(component, /statementDigest:\s*consentStatementDigest/);
});

test("contact consent wording has one browser/server canonical digest", async () => {
  assert.equal(
    normaliseVisitorContactConsentStatement(`  I agree to a reply\nabout this request.  `),
    CONSENT_STATEMENT,
  );
  assert.equal(await visitorContactConsentDigest(CONSENT_STATEMENT), CONSENT_STATEMENT_DIGEST);
  assert.equal(
    await visitorContactConsentDigest(`  I agree to a reply\nabout this request.  `),
    CONSENT_STATEMENT_DIGEST,
  );
});

test("mounted dispatcher requires an exact enabled install and keeps the generic form route private", async () => {
  process.env.PORTAL_BACKEND ??= "memory";
  const [{ NextRequest }, route, storageModule, runtimeStorage, installs, tenants] = await Promise.all([
    import("next/server"),
    import("../src/app/api/portal/[module]/[...rest]/route"),
    import("../src/lib/server/pluginStorage"),
    import("../src/server/storage"),
    import("../src/server/pluginInstalls"),
    import("../src/server/tenants"),
  ]);
  const agency = tenants.createAgency({ name: "Visitor Dispatcher", slug: `visitor-dispatcher-${Date.now()}` });
  const client = tenants.createClient(agency.id, { name: "Visitor Site", slug: `visitor-site-${Date.now()}` });
  const install = installs.upsertInstall({
    pluginId: "website-editor",
    scope: { agencyId: agency.id, clientId: client.id },
    enabled: true,
    config: {},
    features: {},
  });
  const storage = storageModule.makePluginStorage(install.id);
  const site = await createSite(storage, {
    agencyId: agency.id,
    clientId: client.id,
    name: "Mounted site",
    slug: "mounted-site",
  });
  const page = await createPage(storage, {
    agencyId: agency.id,
    clientId: client.id,
    siteId: site.id,
    title: "Mounted contact",
    slug: "contact",
    blocks: [{
      id: "contact_block",
      type: "contact-form",
      props: { consentVersion: 3, consentLabel: CONSENT_STATEMENT },
    }],
  });
  await publishPage(storage, agency.id, client.id, site.id, page.id);
  await runtimeStorage.flushPendingWrites();

  const dispatch = async (rest: string[], query: Record<string, string>, body: unknown) => {
    const search = new URLSearchParams(query).toString();
    const request = new NextRequest(`http://localhost/api/portal/website-editor/${rest.join("/")}${search ? `?${search}` : ""}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost", "x-forwarded-for": "198.51.100.77" },
      body: JSON.stringify(body),
    });
    return withRequestScope({}, () => route.POST(request, {
      params: Promise.resolve({ module: "website-editor", rest }),
    }));
  };

  const body = contactBody(site.id, page.id, "mounted_contact_0001");
  assert.equal((await dispatch(["visitor", "contact"], {}, body)).status, 401);
  assert.equal((await dispatch(["forms", "submit"], { agencyId: agency.id, clientId: client.id }, body)).status, 401);
  assert.equal((await dispatch(
    ["visitor", "contact"],
    { agencyId: agency.id, clientId: client.id },
    body,
  )).status, 201);
});

test("contact facade requires published tenant content, exact DTOs, origin and affirmative consent", async () => {
  const draft = await fixture(context(), false);
  assert.equal((await post(draft.ctx, contactBody(draft.site.id, draft.page.id))).status, 404);

  const ready = await fixture();
  const base = contactBody(ready.site.id, ready.page.id);
  assert.equal((await post(ready.ctx, { ...base, consent: { ...base.consent, agreed: false } })).status, 400);
  assert.equal((await post(ready.ctx, { ...base, consent: { ...base.consent, version: 2 } })).status, 400);
  const withoutDigest = { ...base.consent } as Record<string, unknown>;
  delete withoutDigest.statementDigest;
  assert.equal((await post(ready.ctx, { ...base, consent: withoutDigest })).status, 400);
  const staleWording = await post(ready.ctx, {
    ...base,
    consent: {
      ...base.consent,
      statementDigest: await visitorContactConsentDigest("I agree to different wording."),
    },
  });
  assert.equal(staleWording.status, 400);
  assert.deepEqual(await staleWording.json(), {
    ok: false,
    error: "The consent wording changed. Please review it and submit again.",
  });
  assert.equal((await ready.ctx.storage.list("visitor-contact-operation:v1:")).length, 0);
  assert.equal((await post(ready.ctx, { ...base, operatorRole: "agency-owner" })).status, 400);
  assert.equal((await post(ready.ctx, base, "https://attacker.example.test")).status, 403);
  assert.equal((await post(ready.ctx, { ...base, blockId: "missing" })).status, 404);

  const otherTenant = context(memoryStorage(), "agency_other", "client_other");
  assert.equal((await post(otherTenant, base)).status, 404, "another install could resolve the first tenant's page");
});

test("contact facade persists one consent record and returns no operator data", async () => {
  const ready = await fixture();
  const response = await post(ready.ctx, contactBody(ready.site.id, ready.page.id));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const reply = await response.json() as Record<string, unknown>;
  assert.deepEqual(Object.keys(reply).sort(), ["ok", "receiptId"]);
  assert.equal(reply.ok, true);

  const keys = await ready.ctx.storage.list("visitor-contact-operation:v1:");
  assert.equal(keys.length, 1);
  const operation = await ready.ctx.storage.get<{
    fingerprint?: string;
    receiptId?: string;
    submission?: VisitorContactSubmission;
  }>(keys[0]!);
  const stored = operation?.submission;
  assert.equal(stored?.agencyId, AGENCY);
  assert.equal(stored?.clientId, CLIENT);
  assert.equal(stored?.formName, "Website contact");
  assert.equal(stored?.consent.agreed, true);
  assert.equal(stored?.consent.purpose, "contact-request");
  assert.equal(stored?.consent.version, 3);
  assert.equal(stored?.consent.statementDigest, CONSENT_STATEMENT_DIGEST);
  assert.equal(stored?.consent.statement, CONSENT_STATEMENT);
  assert.equal(stored?.sourcePath, "/contact", "referer query leaked into the contact record");
  assert.equal((stored as unknown as Record<string, unknown>).actor, undefined);

  assert.match(operation?.fingerprint ?? "", /^[a-f0-9]{64}$/);
  assert.equal(operation?.receiptId, reply.receiptId);
  assert.equal(
    (JSON.stringify(operation).match(/visitor@example\.test/g) ?? []).length,
    1,
    "visitor PII must have one canonical stored copy",
  );
  assert.equal((await ready.ctx.storage.list("visitor-contact-submission:v1:")).length, 0);

  const operatorResponse = await handleListVisitorContacts(new Request(
    `${ORIGIN}/api/portal/website-editor/forms/contact-submissions?limit=10`,
  ), { ...ready.ctx, actor: "operator_user" });
  assert.equal(operatorResponse.status, 200);
  const operatorReply = await operatorResponse.json() as { submissions: VisitorContactSubmission[] };
  assert.equal(operatorReply.submissions.length, 1);
  assert.equal(operatorReply.submissions[0]?.id, reply.receiptId);
});

test("contact operation is idempotent and rejects a changed replay", async () => {
  const ready = await fixture();
  const body = contactBody(ready.site.id, ready.page.id);
  const first = await post(ready.ctx, body);
  const firstReply = await first.json() as { receiptId: string };
  const replay = await post(ready.ctx, body);
  const replayReply = await replay.json() as { receiptId: string };
  assert.equal(replay.status, 200);
  assert.equal(replayReply.receiptId, firstReply.receiptId);
  assert.equal((await ready.ctx.storage.list("visitor-contact-operation:v1:")).length, 1);

  const conflict = await post(ready.ctx, {
    ...body,
    contact: { ...body.contact, message: "Changed replay" },
  });
  assert.equal(conflict.status, 409);
  assert.equal((await ready.ctx.storage.list("visitor-contact-operation:v1:")).length, 1);
});

test("contact security controls fail closed and throttle a shared install", async () => {
  const unlocked = await fixture(context(memoryStorage(false)));
  assert.equal((await post(unlocked.ctx, contactBody(unlocked.site.id, unlocked.page.id))).status, 503);
  assert.equal((await unlocked.ctx.storage.list("visitor-contact-operation:v1:")).length, 0);

  const ready = await fixture();
  for (let index = 0; index < 8; index += 1) {
    const response = await post(
      ready.ctx,
      contactBody(ready.site.id, ready.page.id, `contact_limit_${String(index).padStart(4, "0")}`),
      ORIGIN,
      "203.0.113.88",
    );
    assert.equal(response.status, 201);
  }
  const limited = await post(
    ready.ctx,
    contactBody(ready.site.id, ready.page.id, "contact_limit_9999"),
    ORIGIN,
    "203.0.113.88",
  );
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) >= 1);
  const buckets = await ready.ctx.storage.get<Record<string, unknown>>(
    "website-editor:visitor-rate-limit:v1",
  );
  assert.doesNotMatch(
    JSON.stringify(buckets),
    /203\.0\.113\.88/,
    "the durable rate-limit ledger retained a plaintext visitor IP address",
  );
  assert.ok(
    Object.keys(buckets ?? {}).every(key => /^(?:contact-ip|contact-install):[a-f0-9]{64}$/.test(key)),
    "rate-limit buckets must use one-way identity digests",
  );
});

test("public blog feed returns published summaries only through an allowlist DTO", async () => {
  const ready = await fixture();
  await createBlogPost(ready.ctx.storage, {
    agencyId: AGENCY,
    clientId: CLIENT,
    siteId: ready.site.id,
    title: "Public story",
    slug: "public-story",
    excerpt: "Visible summary",
    author: "Public Author",
    tags: ["news"],
    status: "published",
    body: [{ id: "secret", type: "html", props: { html: "PRIVATE BODY" } }],
  });
  await createBlogPost(ready.ctx.storage, {
    agencyId: AGENCY,
    clientId: CLIENT,
    siteId: ready.site.id,
    title: "Draft story",
    excerpt: "PRIVATE DRAFT",
    status: "draft",
  });

  const response = await handleVisitorBlogPosts(new Request(
    `${ORIGIN}/api/portal/website-editor/public/blog/posts?siteId=${ready.site.id}&limit=99`,
    { headers: { "x-forwarded-for": "192.0.2.42" } },
  ), ready.ctx);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const reply = await response.json() as { ok: boolean; posts: Array<Record<string, unknown>> };
  assert.equal(reply.ok, true);
  assert.equal(reply.posts.length, 1);
  assert.deepEqual(Object.keys(reply.posts[0]!).sort(), ["author", "excerpt", "publishedAt", "slug", "tags", "title"]);
  assert.equal(reply.posts[0]!.slug, "public-story");
  assert.equal(reply.posts[0]!.body, undefined);
  assert.equal(reply.posts[0]!.agencyId, undefined);
  assert.doesNotMatch(JSON.stringify(reply), /PRIVATE/);
  const buckets = await ready.ctx.storage.get<Record<string, unknown>>(
    "website-editor:visitor-rate-limit:v1",
  );
  assert.doesNotMatch(JSON.stringify(buckets), /192\.0\.2\.42/);
  assert.deepEqual(
    Object.keys(buckets ?? {}).map(key => key.split(":")[0]).sort(),
    ["blog", "blog-install"],
    "the public feed needs both caller and install-wide durable ceilings",
  );
  assert.ok(
    Object.keys(buckets ?? {}).every(key => /^(?:blog|blog-install):[a-f0-9]{64}$/.test(key)),
    "blog rate-limit buckets must use one-way identity digests",
  );

  const unlocked = await fixture(context(memoryStorage(false)));
  const unavailable = await handleVisitorBlogPosts(new Request(
    `${ORIGIN}/api/portal/website-editor/public/blog/posts?siteId=${unlocked.site.id}`,
  ), unlocked.ctx);
  assert.equal(unavailable.status, 503, "public blog rate control silently lost its durable lock");
});

test("public blog detail returns one published body through an allowlist DTO", async () => {
  const ready = await fixture();
  const body = [{ id: "published_heading", type: "heading", props: { text: "Published body" } }];
  await createBlogPost(ready.ctx.storage, {
    agencyId: AGENCY,
    clientId: CLIENT,
    siteId: ready.site.id,
    title: "Public detail",
    slug: "public-detail",
    excerpt: "Visible detail",
    coverImg: "https://cdn.example.test/cover.jpg",
    author: "Public Author",
    tags: ["news"],
    status: "published",
    body,
  });
  await createBlogPost(ready.ctx.storage, {
    agencyId: AGENCY,
    clientId: CLIENT,
    siteId: ready.site.id,
    title: "Draft detail",
    slug: "draft-detail",
    tags: ["private"],
    status: "draft",
    body: [{ id: "private", type: "html", props: { html: "PRIVATE DRAFT" } }],
  });

  const response = await getBlogPost(ready.ctx, ready.site.id, "public-detail", "192.0.2.51");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const reply = await response.json() as { ok: boolean; post: Record<string, unknown> };
  assert.equal(reply.ok, true);
  assert.deepEqual(Object.keys(reply.post).sort(), [
    "author", "body", "coverImg", "excerpt", "publishedAt", "slug", "tags", "title",
  ]);
  assert.deepEqual(reply.post.body, body);
  assert.equal(reply.post.id, undefined);
  assert.equal(reply.post.agencyId, undefined);
  assert.equal(reply.post.clientId, undefined);
  assert.equal(reply.post.siteId, undefined);
  assert.equal(reply.post.status, undefined);
  assert.equal(reply.post.createdAt, undefined);
  assert.equal(reply.post.updatedAt, undefined);

  assert.equal((await getBlogPost(ready.ctx, ready.site.id, "draft-detail")).status, 404);
  assert.equal((await getBlogPost(ready.ctx, ready.site.id, "missing-detail")).status, 404);
  const otherTenant = context(memoryStorage(), "agency_other_blog", "client_other_blog");
  assert.equal(
    (await getBlogPost(otherTenant, ready.site.id, "public-detail")).status,
    404,
    "another install could resolve the first tenant's blog post",
  );

  await updateSite(ready.ctx.storage, AGENCY, CLIENT, ready.site.id, { status: "draft" });
  assert.equal(
    (await getBlogPost(ready.ctx, ready.site.id, "public-detail")).status,
    404,
    "an inactive site still exposed a published blog post",
  );

  const unlocked = await fixture(context(memoryStorage(false)));
  await createBlogPost(unlocked.ctx.storage, {
    agencyId: AGENCY,
    clientId: CLIENT,
    siteId: unlocked.site.id,
    title: "Unlocked detail",
    slug: "unlocked-detail",
    tags: [],
    status: "published",
  });
  assert.equal(
    (await getBlogPost(unlocked.ctx, unlocked.site.id, "unlocked-detail")).status,
    503,
    "public blog detail silently lost its durable lock",
  );
});

test("blog bodies are finite and cannot recursively mount blog-post blocks", async () => {
  const ready = await fixture();
  const recursiveBody = [{
    id: "recursive_blog",
    type: "blog-post",
    props: { slug: "self" },
  }];
  assert.match(validateBlogPostBody(recursiveBody) ?? "", /cannot be blog-post/);

  let nested: unknown[] = [{ id: "leaf", type: "text", props: { text: "leaf" } }];
  for (let depth = 0; depth < BLOG_POST_BODY_MAX_DEPTH; depth += 1) {
    nested = [{ id: `depth_${depth}`, type: "section", props: {}, children: nested }];
  }
  assert.match(validateBlogPostBody(nested) ?? "", /nested levels/);

  await assert.rejects(
    createBlogPost(ready.ctx.storage, {
      agencyId: AGENCY,
      clientId: CLIENT,
      siteId: ready.site.id,
      title: "Recursive create",
      slug: "recursive-create",
      status: "published",
      body: recursiveBody,
    }),
    BlogPostBodyValidationError,
  );

  const safe = await createBlogPost(ready.ctx.storage, {
    agencyId: AGENCY,
    clientId: CLIENT,
    siteId: ready.site.id,
    title: "Safe before update",
    slug: "safe-before-update",
    status: "published",
    body: [{ id: "safe", type: "text", props: { text: "safe" } }],
  });
  await assert.rejects(
    updateBlogPost(ready.ctx.storage, AGENCY, CLIENT, ready.site.id, safe.id, { body: recursiveBody }),
    BlogPostBodyValidationError,
  );

  // Legacy/corrupt storage is also refused by the visitor facade rather than
  // reaching the recursive React renderer.
  await ready.ctx.storage.set(storageKeys.blogPost(AGENCY, CLIENT, ready.site.id, safe.id), {
    ...safe,
    body: recursiveBody,
  });
  assert.equal(
    (await getBlogPost(ready.ctx, ready.site.id, safe.slug, "192.0.2.92")).status,
    404,
  );

  const component = readFileSync(
    new URL("../src/built-ins/modules/website-editor/src/components/blocks/BlogPostBlock.tsx", import.meta.url),
    "utf8",
  );
  assert.match(component, /isSafeBlogPostBody\(row\.body\)/);
  assert.match(component, /renderChildren\(post\.body\)/);
});
