import { isIP } from "node:net";

export function isReservedSyntheticHostname(hostname: string): boolean {
  return hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || hostname.endsWith(".internal")
    || hostname.endsWith(".test")
    || hostname.endsWith(".invalid")
    || hostname.endsWith(".example");
}

export function isUnsafeSyntheticAddress(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0] ?? address.toLowerCase();
  if (normalized.startsWith("::ffff:")) return isUnsafeSyntheticAddress(normalized.slice(7));
  if (isIP(normalized) === 4) {
    const octets = normalized.split(".").map(Number);
    const [a, b] = octets;
    return a === 0 || a === 10 || a === 127 || a! >= 224
      || (a === 100 && b! >= 64 && b! <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b! >= 16 && b! <= 31)
      || (a === 192 && b === 0)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19));
  }
  if (isIP(normalized) === 6) {
    return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd")
      || /^fe[89ab]/.test(normalized) || normalized.startsWith("2001:db8:");
  }
  return true;
}
