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
  const unwrapped = host.startsWith("[") && host.endsWith("]")
    ? host.slice(1, -1)
    : host;
  // Loopback.
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host === "127.0.0.1" || unwrapped === "::" || unwrapped === "::1") return false;
  if (/^127\./.test(host)) return false;
  // Names that only resolve on a LAN.
  if (host.endsWith(".local") || host.endsWith(".internal")) return false;
  // RFC1918 private ranges + link-local.
  if (/^10\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^169\.254\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  // IPv4 unspecified/broadcast/reserved destinations. Public security links
  // must name a routable service, never a wildcard listener.
  if (/^0\./.test(host) || host === "255.255.255.255") return false;
  // IPv6 ULA (fc00::/7), link-local (fe80::/10), and IPv4-mapped private or
  // loopback addresses. URL.hostname retains brackets on some runtimes, hence
  // the normalised `unwrapped` form above.
  if (/^f[cd][0-9a-f]{2}:/i.test(unwrapped)) return false;
  if (/^fe[89ab][0-9a-f]:/i.test(unwrapped)) return false;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(unwrapped)?.[1];
  if (mapped && !isPubliclyReachableOrigin(`https://${mapped}`)) return false;
  // WHATWG URL canonicalises mapped dotted IPv4 to hex (for example
  // ::ffff:127.0.0.1 -> ::ffff:7f00:1). Public auth origins have no need for
  // this ambiguous representation, so reject the entire mapped range.
  if (/^::ffff:/i.test(unwrapped)) return false;
  return true;
}
