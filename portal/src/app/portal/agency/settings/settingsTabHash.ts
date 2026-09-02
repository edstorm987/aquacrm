/**
 * Resolve a Settings fragment without depending on the browser.
 *
 * URL fragments never reach the Next.js server render, so Settings renders its
 * stable default first and resolves the real tab as soon as the client mounts.
 * Keeping this part pure makes direct-entry and legacy deep links testable.
 */
export function resolveSettingsTabHash<T extends string>(
  hash: string,
  validTabs: ReadonlySet<T>,
  aliases: Readonly<Record<string, T>>,
): T | null {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  const requested = aliases[fragment] ?? fragment;
  return validTabs.has(requested as T) ? requested as T : null;
}
