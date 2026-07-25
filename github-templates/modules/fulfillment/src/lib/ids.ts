// Lightweight id generator. Avoids a runtime dep on `nanoid` so the
// plugin keeps its `dependencies` empty.

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export function makeId(prefix: string, length = 12): string {
  let id = "";
  // crypto-strong randomness when available; fall back to Math.random
  // (the foundation seeds tests with a deterministic stub).
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

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || `slug-${Date.now()}`;
}
