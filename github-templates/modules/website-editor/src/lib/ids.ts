// Lightweight id generator. Mirrors T2's pattern; avoids a runtime dep on
// `nanoid` so the plugin keeps its `dependencies` empty.

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

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `slug-${Date.now()}`
  );
}

export const blockId = (type: string) => makeId(`blk-${type}`, 8);
export const pageId = () => makeId("page", 10);
export const siteId = () => makeId("site", 10);
export const themeId = () => makeId("theme", 10);
export const variantId = () => makeId("variant", 10);
export const assetId = () => makeId("asset", 10);
