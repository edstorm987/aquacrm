const CLIENT_PORTAL_PATH = /^\/portal\/clients\/([^/]+)(?:\/|$)/;

export function clientIdFromPortalReferer(
  requestUrl: string,
  referer: string | null,
): string | undefined {
  if (!referer) return undefined;
  try {
    const request = new URL(requestUrl);
    const source = new URL(referer, request);
    if (source.origin !== request.origin) return undefined;
    const match = CLIENT_PORTAL_PATH.exec(source.pathname);
    if (!match?.[1]) return undefined;
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}
