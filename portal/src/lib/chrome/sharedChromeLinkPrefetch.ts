/**
 * Local development compiles a destination the first time Next prefetches it.
 * A mounted portal shell can expose dozens of navigation links at once, so
 * development-only automatic prefetch turns one requested page into a hidden
 * compile storm. Production keeps Next's normal prefetch policy; localhost
 * compiles a route only when the operator actually follows it.
 */
export function sharedChromeLinkPrefetch(
  environment = process.env.NODE_ENV,
): false | undefined {
  return environment === "development" ? false : undefined;
}
