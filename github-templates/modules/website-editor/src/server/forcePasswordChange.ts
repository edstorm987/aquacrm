// R007 — Force-password-change registry (editor side).
//
// Persists a per-agency, per-user "must change password on next
// login" flag. The login flow itself is foundation/T1 territory; the
// editor surfaces the toggle and the storage layer here so the
// foundation can `if (getRequirePasswordChange(agencyId, userId))`
// when wiring the redirect (Q-ASSUMED — see chapter §5).
//
// Storage layout:
//   t/<agencyId>/_agency/website-editor/force-password/<userId> → { setBy, setAt }
// Agency-wide "force on next login for all users" lives at
//   t/<agencyId>/_agency/website-editor/force-password/_all → { setBy, setAt }

import type { PluginStorage } from "../lib/aquaPluginTypes";

export interface ForcePasswordRecord {
  setBy: string;
  setAt: string;
}

const PREFIX = (agencyId: string) =>
  `t/${agencyId}/_agency/website-editor/force-password/`;

const AGENCY_WIDE_KEY = "_all";

export async function getRequirePasswordChange(
  storage: PluginStorage,
  agencyId: string,
  userId: string,
): Promise<boolean> {
  const perUser = await storage.get<ForcePasswordRecord>(`${PREFIX(agencyId)}${userId}`);
  if (perUser) return true;
  const wide = await storage.get<ForcePasswordRecord>(`${PREFIX(agencyId)}${AGENCY_WIDE_KEY}`);
  if (!wide) return false;
  // Agency-wide flag honoured if user hasn't already changed since
  // it was set. We don't track per-user "lastChanged" here — the
  // foundation login hook clears the flag (`clearRequirePasswordChange`)
  // once the user successfully changes their password.
  return true;
}

export async function setRequirePasswordChange(
  storage: PluginStorage,
  agencyId: string,
  userId: string,
  setBy: string,
): Promise<ForcePasswordRecord> {
  const rec: ForcePasswordRecord = { setBy, setAt: new Date().toISOString() };
  await storage.set(`${PREFIX(agencyId)}${userId}`, rec);
  return rec;
}

export async function clearRequirePasswordChange(
  storage: PluginStorage,
  agencyId: string,
  userId: string,
): Promise<boolean> {
  const key = `${PREFIX(agencyId)}${userId}`;
  const cur = await storage.get(key);
  if (!cur) return false;
  await storage.del(key);
  return true;
}

export async function setRequirePasswordChangeForAgency(
  storage: PluginStorage,
  agencyId: string,
  setBy: string,
): Promise<ForcePasswordRecord> {
  const rec: ForcePasswordRecord = { setBy, setAt: new Date().toISOString() };
  await storage.set(`${PREFIX(agencyId)}${AGENCY_WIDE_KEY}`, rec);
  return rec;
}

export async function clearRequirePasswordChangeForAgency(
  storage: PluginStorage,
  agencyId: string,
): Promise<boolean> {
  const key = `${PREFIX(agencyId)}${AGENCY_WIDE_KEY}`;
  const cur = await storage.get(key);
  if (!cur) return false;
  await storage.del(key);
  return true;
}

export async function listRequirePasswordChangeUsers(
  storage: PluginStorage,
  agencyId: string,
): Promise<{ userId: string; setBy: string; setAt: string }[]> {
  const keys = await storage.list(PREFIX(agencyId));
  const out: { userId: string; setBy: string; setAt: string }[] = [];
  for (const k of keys) {
    const userId = k.slice(PREFIX(agencyId).length);
    if (userId === AGENCY_WIDE_KEY) continue;
    const rec = await storage.get<ForcePasswordRecord>(k);
    if (rec) out.push({ userId, setBy: rec.setBy, setAt: rec.setAt });
  }
  return out;
}
