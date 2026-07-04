// useContentImage — like useContent but for image URLs, with a fallback
// to a placeholder when nothing is configured.

import { useContent } from "./useContent";

const PLACEHOLDER = "/_aqua/placeholders/image.svg";

export function useContentImage(siteId: string, key: string, fallback?: string): string {
  const value = useContent<string>(siteId, key, fallback ?? PLACEHOLDER);
  return typeof value === "string" && value.length > 0 ? value : PLACEHOLDER;
}
