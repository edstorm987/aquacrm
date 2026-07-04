// Per-user referral DISCOUNT CODE store, server-side.
//
// Lifted from `02 felicias aqua portal work/src/lib/referralCodes.ts`
// and rewired off localStorage onto the plugin's `StoragePort`.

import { now } from "../lib/time";
import type { StoragePort } from "./ports";

export interface ReferralCode {
  email: string;
  code: string;
  createdAt: number;
  uses: number;
}

const KEY_BY_EMAIL = "ref-by-email:";
const KEY_BY_CODE = "ref-by-code:";

function buildCode(email: string): string {
  const handle = (email.split("@")[0] ?? "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 8) || "FRIEND";
  return `${handle}10`;
}

function disambiguate(code: string): string {
  const tail = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${code}-${tail}`;
}

const norm = (s: string) => s.trim().toLowerCase();

export class ReferralCodeService {
  constructor(private storage: StoragePort) {}

  async getOrCreateForUser(email: string): Promise<ReferralCode> {
    const e = norm(email);
    const existing = await this.storage.get<ReferralCode>(`${KEY_BY_EMAIL}${e}`);
    if (existing) return existing;
    let code = buildCode(e);
    while (await this.storage.get<string>(`${KEY_BY_CODE}${code}`)) code = disambiguate(code);
    const record: ReferralCode = { email: e, code, createdAt: now(), uses: 0 };
    await this.storage.set(`${KEY_BY_EMAIL}${e}`, record);
    await this.storage.set(`${KEY_BY_CODE}${code}`, e);
    return record;
  }

  async findCode(code: string): Promise<ReferralCode | null> {
    const owner = await this.storage.get<string>(`${KEY_BY_CODE}${code.trim().toUpperCase()}`);
    if (!owner) return null;
    const record = await this.storage.get<ReferralCode>(`${KEY_BY_EMAIL}${owner}`);
    return record ?? null;
  }

  async incrementUse(code: string): Promise<void> {
    const owner = await this.storage.get<string>(`${KEY_BY_CODE}${code.trim().toUpperCase()}`);
    if (!owner) return;
    const record = await this.storage.get<ReferralCode>(`${KEY_BY_EMAIL}${owner}`);
    if (!record) return;
    await this.storage.set(`${KEY_BY_EMAIL}${owner}`, { ...record, uses: record.uses + 1 });
  }
}
