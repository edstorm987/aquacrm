// Gift cards — server-side, per-install storage.
//
// Lifted from `02 felicias aqua portal work/src/lib/giftCards.ts` and
// rewired off localStorage onto the plugin's `StoragePort`.

import { now } from "../lib/time";
import type { StoragePort } from "./ports";

export interface GiftCard {
  code: string;
  amount: number;
  balance: number;
  recipientName: string;
  recipientEmail: string;
  senderName: string;
  message: string;
  createdAt: number;
  redemptions: { amount: number; at: number }[];
}

const KEY_PREFIX = "giftcard:";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";  // no ambiguous 0/O/I/1

function generateCode(): string {
  const segments: string[] = [];
  for (let s = 0; s < 3; s++) {
    let seg = "";
    for (let i = 0; i < 4; i++) {
      seg += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    segments.push(seg);
  }
  return `GC-${segments.join("-")}`;
}

export class GiftCardService {
  constructor(private storage: StoragePort) {}

  private key(code: string): string {
    return `${KEY_PREFIX}${code.trim().toUpperCase()}`;
  }

  async issue(input: Omit<GiftCard, "code" | "balance" | "createdAt" | "redemptions">): Promise<GiftCard> {
    let code = generateCode();
    while (await this.storage.get(this.key(code))) code = generateCode();
    const card: GiftCard = {
      code,
      balance: input.amount,
      createdAt: now(),
      redemptions: [],
      ...input,
    };
    await this.storage.set(this.key(code), card);
    return card;
  }

  async getCard(code: string): Promise<GiftCard | null> {
    const card = await this.storage.get<GiftCard>(this.key(code));
    return card ?? null;
  }

  async redeem(code: string, amount: number): Promise<{ ok: true; card: GiftCard; applied: number } | { ok: false; reason: string }> {
    const card = await this.getCard(code);
    if (!card) return { ok: false, reason: "We couldn't find that gift card." };
    if (card.balance <= 0) return { ok: false, reason: "This gift card has no balance left." };
    const applied = Math.min(card.balance, amount);
    const next: GiftCard = {
      ...card,
      balance: card.balance - applied,
      redemptions: [...card.redemptions, { amount: applied, at: now() }],
    };
    await this.storage.set(this.key(code), next);
    return { ok: true, card: next, applied };
  }

  async refund(code: string, amount: number): Promise<void> {
    const card = await this.getCard(code);
    if (!card) return;
    await this.storage.set(this.key(code), {
      ...card,
      balance: card.balance + amount,
    });
  }

  async listAll(): Promise<GiftCard[]> {
    const keys = await this.storage.list(KEY_PREFIX);
    const cards = await Promise.all(keys.map(k => this.storage.get<GiftCard>(k)));
    return cards
      .filter((c): c is GiftCard => c !== undefined)
      .sort((a, b) => b.createdAt - a.createdAt);
  }
}
