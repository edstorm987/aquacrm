/**
 * Is an origin reachable from a stranger's browser?
 *
 * Anything we hand out to be pasted into someone else's website — the Aqua Tag
 * snippet above all — is worthless if it points somewhere only this machine can
 * reach. The trap this exists to close: `NEXT_PUBLIC_PORTAL_BASE_URL` is *set*
 * in local dev (to `http://localhost:3032`), so "is the env var configured?" is
 * not the same question and answers it wrongly, staying silent exactly when the
 * snippet is a dud.
 *
 * Deliberately conservative: an origin we cannot parse counts as unreachable.
 */
export function isPubliclyReachableOrigin(origin: string): boolean {
  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!host) return false;
  // Loopback.
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host === "127.0.0.1" || host === "::1" || host === "[::1]") return false;
  if (/^127\./.test(host)) return false;
  // Names that only resolve on a LAN.
  if (host.endsWith(".local") || host.endsWith(".internal")) return false;
  // RFC1918 private ranges + link-local.
  if (/^10\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^169\.254\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  return true;
}
