import type {
  EditorPage,
  EditorPagePublishedSnapshot,
  UpdatePagePatch,
} from "../types/editorPage";
import type { ThemeRecord } from "../types/theme";

const PUBLICATION_FIELDS = [
  "slug",
  "title",
  "description",
  "isHomepage",
  "portalRole",
  "isActivePortal",
  "privacy",
  "passwordHash",
  "themeId",
  "customCSS",
  "customCss",
  "customHead",
  "customFoot",
  "headInjection",
  "layoutOverrides",
  "seo",
  "redirectSourceSlugs",
  "locales",
] as const satisfies readonly (keyof UpdatePagePatch)[];

function cloneJsonValue<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Capture the complete visitor-visible page state at Publish time. */
export function capturePublishedPage(
  page: EditorPage,
  options: { theme?: ThemeRecord | null } = {},
): EditorPagePublishedSnapshot {
  return {
    version: 2,
    slug: page.slug,
    title: page.title,
    description: page.description,
    isHomepage: page.isHomepage,
    portalRole: page.portalRole,
    isActivePortal: page.isActivePortal,
    privacy: page.privacy,
    passwordHash: page.passwordHash,
    themeId: page.themeId,
    theme: cloneJsonValue(options.theme ?? null),
    customCSS: page.customCSS,
    customCss: page.customCss,
    customHead: page.customHead,
    customFoot: page.customFoot,
    headInjection: page.headInjection,
    layoutOverrides: cloneJsonValue(page.layoutOverrides),
    seo: cloneJsonValue(page.seo),
    redirectSourceSlugs: cloneJsonValue(page.redirectSourceSlugs),
    locales: cloneJsonValue(page.locales),
  };
}

/**
 * Whether a stored snapshot includes portal classification. Version 1 rows
 * pre-date these keys, so an absent value there means "not captured" rather
 * than the version-2 meaning "published without a portal role".
 */
export function publishedPageSnapshotNeedsMigration(page: EditorPage): boolean {
  const published = page.publishedPage as (Partial<EditorPagePublishedSnapshot> & { version?: number }) | undefined;
  return !published || published.version !== 2;
}

/** Upgrade a legacy snapshot without replacing its already-published fields. */
export function migratePublishedPageSnapshot(
  page: EditorPage,
  options: { theme?: ThemeRecord | null } = {},
): EditorPagePublishedSnapshot {
  if (!page.publishedPage) return capturePublishedPage(page, options);
  const published = page.publishedPage as Partial<EditorPagePublishedSnapshot> & { version?: number };
  const publishedTheme = Object.prototype.hasOwnProperty.call(published, "theme")
    ? published.theme ?? null
    : options.theme ?? null;
  return {
    ...published,
    version: 2,
    portalRole: page.portalRole,
    isActivePortal: page.isActivePortal,
    // Version-1 snapshots pre-date the embedded theme record. Freeze the
    // pre-edit theme supplied by updatePage while upgrading so subsequent
    // theme edits cannot bleed into an already-published page. If a legacy
    // row does carry a theme key, preserve that published value verbatim.
    theme: cloneJsonValue(publishedTheme),
  } as EditorPagePublishedSnapshot;
}

/** True when an editor patch changes any visitor-visible non-block field. */
export function touchesPublishedPage(patch: UpdatePagePatch): boolean {
  return PUBLICATION_FIELDS.some(field => Object.prototype.hasOwnProperty.call(patch, field));
}

/**
 * Resolve the immutable public view. Legacy published rows without a snapshot
 * retain their historical behaviour until their first post-migration edit;
 * updatePage captures the pre-edit values before applying that edit.
 */
export function resolvePublishedPage(page: EditorPage): EditorPage {
  const published = page.publishedPage;
  if (!published || page.status !== "published") return page;
  // JSON storage drops keys whose value is undefined. Version 2 makes that
  // absence intentional; only a version-1 row needs to fall back to the
  // pre-migration page columns until migration-on-write captures them.
  const hasPublishedPortalClassification = published.version === 2;
  return {
    ...page,
    slug: published.slug,
    title: published.title,
    description: published.description,
    isHomepage: published.isHomepage,
    portalRole: hasPublishedPortalClassification ? published.portalRole : page.portalRole,
    isActivePortal: hasPublishedPortalClassification ? published.isActivePortal : page.isActivePortal,
    privacy: published.privacy,
    passwordHash: published.passwordHash,
    themeId: published.themeId,
    customCSS: published.customCSS,
    customCss: published.customCss,
    customHead: published.customHead,
    customFoot: published.customFoot,
    headInjection: published.headInjection,
    layoutOverrides: cloneJsonValue(published.layoutOverrides),
    seo: cloneJsonValue(published.seo),
    redirectSourceSlugs: cloneJsonValue(published.redirectSourceSlugs),
    locales: cloneJsonValue(published.locales),
    blocks: page.publishedBlocks ?? page.blocks,
    draftBlocks: undefined,
  };
}

/** Restore the working copy to the last published non-block state. */
export function restorePublishedPage(page: EditorPage): EditorPage {
  return resolvePublishedPage(page);
}

/** Resolve the token record paired with the published page snapshot. */
export function resolvePublishedTheme(
  page: EditorPage,
  currentTheme?: ThemeRecord | null,
): ThemeRecord | null {
  if (
    page.status === "published"
    && page.publishedPage
    && Object.prototype.hasOwnProperty.call(page.publishedPage, "theme")
  ) {
    return cloneJsonValue(page.publishedPage.theme ?? null);
  }
  return currentTheme ?? null;
}
