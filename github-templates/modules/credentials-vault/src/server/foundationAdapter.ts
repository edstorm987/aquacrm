import type { AgencyId, ClientId, PluginInstall, UserId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EventBusPort,
  TenantPort,
  UserPort,
} from "./ports";
import type { VaultContainer } from "./index";
import { buildVaultContainer } from "./index";
import { generateKey, loadKeyFromEnv, type CryptoKey } from "./crypto";

export interface VaultFoundation {
  activity: ActivityLogPort;
  events: EventBusPort;
  tenant?: TenantPort;
  user?: UserPort;
  // Optional: when the portal supplies a foundation crypto port, we
  // accept it; otherwise loadKeyFromEnv() resolves at containerFor().
  crypto?: CryptoKey;
  isAdmin?: (actor: UserId) => boolean;
}

let registered: VaultFoundation | null = null;

export function registerVaultFoundation(deps: VaultFoundation): void {
  registered = deps;
}

export function clearVaultFoundation(): void {
  registered = null;
}

export function isFoundationRegistered(): boolean {
  return registered !== null;
}

export function requireFoundation(): VaultFoundation {
  if (!registered) {
    throw new Error(
      "@aqua/plugin-credentials-vault: foundation not registered. Call registerVaultFoundation({...}) at boot.",
    );
  }
  return registered;
}

function resolveKey(injected?: CryptoKey): CryptoKey {
  if (injected) return injected;
  const fromEnv = loadKeyFromEnv();
  if (fromEnv) return fromEnv;
  // In production this should throw; for safety in development /
  // smoke-via-runtime situations we generate an ephemeral key. The
  // operator runbook documents AQUA_VAULT_KEY as required for prod.
  return generateKey();
}

export interface ContainerForArgs {
  agencyId: AgencyId;
  clientId?: ClientId;
  storage: PluginStorage;
  install?: PluginInstall;
  isAdmin?: (actor: UserId) => boolean;
}

export function containerFor(args: ContainerForArgs): VaultContainer {
  const f = requireFoundation();
  return buildVaultContainer({
    agencyId: args.agencyId,
    clientId: args.clientId,
    storage: args.storage,
    activity: f.activity,
    events: f.events,
    crypto: resolveKey(f.crypto),
    isAdmin: args.isAdmin ?? f.isAdmin,
  });
}

export function containerWithDeps(args: {
  agencyId: AgencyId;
  clientId?: ClientId;
  storage: PluginStorage;
  activity: ActivityLogPort;
  events: EventBusPort;
  crypto: CryptoKey;
  isAdmin?: (actor: UserId) => boolean;
}): VaultContainer {
  return buildVaultContainer(args);
}

export function _containerFromCtx(args: {
  agencyId: AgencyId;
  clientId?: ClientId;
  storage: PluginStorage;
}): VaultContainer | null {
  if (!registered) return null;
  return buildVaultContainer({
    agencyId: args.agencyId,
    clientId: args.clientId,
    storage: args.storage,
    activity: registered.activity,
    events: registered.events,
    crypto: resolveKey(registered.crypto),
    isAdmin: registered.isAdmin,
  });
}
