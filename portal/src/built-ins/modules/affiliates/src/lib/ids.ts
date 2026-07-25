// Same id helper as the other Aqua plugins.

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export function makeId(prefix: string, length = 12): string {
  let id = "";
  const cryptoApi = (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (cryptoApi?.getRandomValues) {
    const bytes = new Uint8Array(length);
    cryptoApi.getRandomValues(bytes);
    for (let i = 0; i < length; i++) {
      const byte = bytes[i] ?? 0;
      const ch = ALPHABET[byte % ALPHABET.length] ?? "0";
      id += ch;
    }
  } else {
    for (let i = 0; i < length; i++) {
      const ch = ALPHABET[Math.floor(Math.random() * ALPHABET.length)] ?? "0";
      id += ch;
    }
  }
  return `${prefix}_${id}`;
}

// Human-readable referral code: 4-letter prefix derived from input
// (or random) + 4 digits. Reduces collision risk while staying
// pronounceable. Caller checks for collisions via the service's
// `findByCode`.
export function makeReferralCode(seed?: string): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";   // ambiguous chars dropped
  const digits = "0123456789";
  const prefix = (seed ?? "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4)
    .padEnd(4, randomLetter());
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += digits[randomInt(digits.length)];
  return prefix + suffix;

  function randomLetter(): string {
    return letters[randomInt(letters.length)] ?? "X";
  }
  function randomInt(n: number): number {
    const cryptoApi = (globalThis as unknown as { crypto?: Crypto }).crypto;
    if (cryptoApi?.getRandomValues) {
      const bytes = new Uint8Array(1);
      cryptoApi.getRandomValues(bytes);
      return (bytes[0] ?? 0) % n;
    }
    return Math.floor(Math.random() * n);
  }
}
