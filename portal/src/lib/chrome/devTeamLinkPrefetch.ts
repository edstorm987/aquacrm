const HEAVY_OPTIONAL_DEV_TEAM_PATHS = new Set([
  "/portal/dev-team/editor",
  "/portal/dev-team/findings",
]);

/**
 * Keep the Dev Team landing page responsive by deferring its two expensive,
 * optional destinations until the operator actually follows their link.
 * Returning `undefined` preserves Next's default for every other route.
 */
export function devTeamLinkPrefetch(href: string): false | undefined {
  const queryOrHash = href.search(/[?#]/);
  const pathname = queryOrHash === -1 ? href : href.slice(0, queryOrHash);
  return HEAVY_OPTIONAL_DEV_TEAM_PATHS.has(pathname) ? false : undefined;
}
