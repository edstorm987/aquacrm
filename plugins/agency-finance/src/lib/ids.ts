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

// Sequential invoice number: INV-YYYY-NNNN. Caller supplies the year +
// the next sequence; this just formats. Per-agency uniqueness is the
// caller's responsibility (InvoiceService's seed key tracks it).
export function formatInvoiceNumber(year: number, seq: number): string {
  return `INV-${year}-${String(seq).padStart(4, "0")}`;
}
