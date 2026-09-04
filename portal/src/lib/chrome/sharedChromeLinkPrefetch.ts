/**
 * Whether chrome navigation links let Next automatically prefetch their
 * destination. The answer is now NO in every environment.
 *
 * A mounted portal shell exposes dozens of navigation links at once, and Next
 * prefetches each visible link's payload on load. On this app that is ruinous
 * in BOTH environments:
 *
 *  - Production: every route render is server-heavy (it hydrates the shared
 *    state blob and does render-time work) on a SINGLE always-on Node instance.
 *    Automatic prefetch turns one page load into a storm of 10+ concurrent heavy
 *    renders that convoy on the one process — measured 2026-09-04 at 5–35s per
 *    prefetched route and 8.5s to interactive, while an on-demand warm render is
 *    ~75ms. Prefetch was buying "instant navigation" at the cost of making every
 *    page load unusable.
 *  - Local dev: the same storm is a hidden COMPILE storm (each destination is
 *    compiled the first time it is prefetched).
 *
 * Returning `false` makes navigation on-demand: a click renders just that one
 * route. If a specific hot path ever needs eager prefetch back, opt it in at the
 * link, not globally.
 */
export function sharedChromeLinkPrefetch(
  _environment = process.env.NODE_ENV,
): false | undefined {
  return false;
}
