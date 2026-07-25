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

// Cheap hash for submission idempotency. Not cryptographic — just enough
// to dedupe accidental double-submits within a small window.
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).padStart(7, "0");
}
