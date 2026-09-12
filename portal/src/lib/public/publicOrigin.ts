function parseIpv4(host: string): [number, number, number, number] | null {
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part))) return null;
  const values = parts.map(Number);
  if (values.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return null;
  return values as [number, number, number, number];
}

function isGlobalUnicastIpv4([a, b, c]: [number, number, number, number]): boolean {
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function parseIpv6(host: string): number[] | null {
  // Embedded dotted IPv4 is rejected before this parser. This parser therefore
  // accepts only canonical hexadecimal hextets and cannot fall through to a
  // hostname allow decision for a malformed numeric address.
  if (host.includes(".")) return null;
  const value = host.toLowerCase().split("%", 1)[0]!;
  const pieces = value.split("::");
  if (pieces.length > 2) return null;
  const left = pieces[0] ? pieces[0].split(":") : [];
  const right = pieces[1] ? pieces[1].split(":") : [];
  if (pieces.length === 1 && left.length !== 8) return null;
  if (pieces.length === 2 && left.length + right.length >= 8) return null;
  const parse = (part: string): number | null => /^[0-9a-f]{1,4}$/.test(part)
    ? Number.parseInt(part, 16)
    : null;
  const leftValues = left.map(parse);
  const rightValues = right.map(parse);
  if (leftValues.some(value => value === null) || rightValues.some(value => value === null)) return null;
  const zeros = pieces.length === 2 ? Array(8 - left.length - right.length).fill(0) : [];
  return [...leftValues, ...zeros, ...rightValues] as number[];
}

function isGlobalUnicastIpv6(parts: number[]): boolean {
  if (parts.length !== 8) return false;
  const [first, second, third] = parts;
  if ((first! & 0xe000) !== 0x2000) return false; // only 2000::/3 global unicast
  if (first === 0x2001 && second === 0x0db8) return false; // documentation
  if (first === 0x2001 && second === 0x0002 && third === 0) return false; // benchmark
  if (first === 0x2001 && second! <= 0x002f) return false; // special-purpose registry
  if (first === 0x2002) return false; // deprecated 6to4 transition space
  if (first === 0x3fff) return false; // documentation allocation (conservative /16)
  return true;
}

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
  if (
    host === "localhost" || host.endsWith(".localhost")
    || host.endsWith(".local") || host.endsWith(".internal")
    || host === "example" || host.endsWith(".example")
    || host === "invalid" || host.endsWith(".invalid")
    || host === "test" || host.endsWith(".test")
    || host === "onion" || host.endsWith(".onion")
    || host === "home.arpa" || host.endsWith(".home.arpa")
  ) return false;
  const ipv4 = parseIpv4(unwrapped);
  if (ipv4) return isGlobalUnicastIpv4(ipv4);
  if (unwrapped.includes(":")) {
    // Reject all IPv4-embedded IPv6 forms, including non-canonical input that
    // WHATWG may rewrite to ::ffff:7f00:1, before parsing the remaining IPv6.
    if (unwrapped.includes(".") || /^::ffff:/i.test(unwrapped)) return false;
    const ipv6 = parseIpv6(unwrapped);
    return ipv6 ? isGlobalUnicastIpv6(ipv6) : false;
  }
  return true;
}
