import { AsyncLocalStorage } from "node:async_hooks";

export const LIVE_DATA_REALM_ID = "live";
const REALM_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,95}$/;

interface DataRealmContext {
  realmId: string;
  /** Explicit scopes must not be replaced by the current request cookie. */
  explicit: boolean;
}

const realmContext = new AsyncLocalStorage<DataRealmContext>();

export function normaliseDataRealmId(realmId: string): string {
  const normalised = realmId.trim().toLowerCase();
  if (!REALM_ID_PATTERN.test(normalised)) throw new Error("Invalid data realm id.");
  return normalised;
}

export function getActiveDataRealmId(): string {
  return realmContext.getStore()?.realmId ?? LIVE_DATA_REALM_ID;
}

export function isSandboxDataRealm(): boolean {
  return getActiveDataRealmId() !== LIVE_DATA_REALM_ID;
}

export function runInDataRealm<T>(realmId: string, operation: () => T): T {
  return realmContext.run({ realmId: normaliseDataRealmId(realmId), explicit: true }, operation);
}

export function enterDataRealm(realmId: string): string {
  const valid = normaliseDataRealmId(realmId);
  realmContext.enterWith({ realmId: valid, explicit: false });
  return valid;
}

export function hasActiveDataRealm(): boolean {
  return realmContext.getStore() !== undefined;
}

export function hasExplicitDataRealm(): boolean {
  return realmContext.getStore()?.explicit === true;
}
