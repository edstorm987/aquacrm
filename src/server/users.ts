import "server-only";
// Server-side user store.
//
// Password hashing is scrypt (Node stdlib) — N=16384, r=8, p=1, 16-byte
// random salt. Format: `scrypt$N$r$p$<salt-hex>$<derived-hex>` so the cost
// parameters can be rotated in place later.
//
// `verifyPassword` runs a dummy scrypt against a fixed throwaway hash
// when the email isn't registered, so the response time matches the
// user-found path. Defends against email-enumeration via timing.
//
// Lifted from `02 felicias aqua portal work/src/portal/server/users.ts` and
// adapted for the three-level role hierarchy from `04-architecture.md §3`.

import crypto from "crypto";
import { getState, mutate } from "./storage";
import { emit } from "./eventBus";
import type { Role, ServerUser } from "./types";
import { LEAD_AGENCY_ID } from "./types";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
const SCRYPT_SALT_BYTES = 16;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SCRYPT_SALT_BYTES);
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function verifyHash(password: string, encoded: string): boolean {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = parseInt(parts[1], 10);
  const r = parseInt(parts[2], 10);
  const p = parseInt(parts[3], 10);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], "hex");
    expected = Buffer.from(parts[5], "hex");
  } catch { return false; }
  let actual: Buffer;
  try {
    actual = crypto.scryptSync(password, salt, expected.length, { N, r, p });
  } catch { return false; }
  return crypto.timingSafeEqual(actual, expected);
}

const TRIVIAL_PASSWORDS = new Set([
  "password", "password1", "password123", "passw0rd",
  "12345678", "123456789", "1234567890",
  "qwerty", "qwerty123", "letmein", "welcome", "admin", "admin123",
  "iloveyou", "monkey", "dragon", "abc12345", "111111111",
]);

export interface PasswordValidationResult { ok: boolean; error?: string }

export function validatePassword(password: string): PasswordValidationResult {
  if (typeof password !== "string") return { ok: false, error: "Password is required." };
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  if (password.length > 256) return { ok: false, error: "Password is too long (max 256 chars)." };
  if (TRIVIAL_PASSWORDS.has(password.toLowerCase())) {
    return { ok: false, error: "That password is too common — pick something less guessable." };
  }
  if (/^(.)\1+$/.test(password)) return { ok: false, error: "Password can't be a single repeated character." };
  return { ok: true };
}

function makeId(): string {
  return `usr_${crypto.randomBytes(8).toString("hex")}`;
}

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Compose the storage key for the user record. End-customers are scoped
// per-client because two different clients of the same agency may both
// have a customer named `jane@gmail.com` — they're different humans
// using the same address from the agency's perspective. Agency- and
// client-tier users keep the legacy plain-email key (no collision risk
// because those tiers are unique within an agency by convention).
function userKey(email: string, role: Role, clientId?: string): string {
  const e = normEmail(email);
  if (role === "end-customer" && clientId) return `${e}|c:${clientId}`;
  return e;
}

// Lookup scope for `getUser` / `verifyPassword`. When omitted, the
// helper falls back to the plain-email key (agency/client tier). When
// `clientId` is supplied along with `role: "end-customer"` we look up
// the per-client scoped key; if that misses we fall back to the plain
// key so an agency-side user can sign in via an embed surface that
// happens to know its embedding clientId.
export interface UserLookupScope {
  clientId?: string;
  role?: Role;
}

export interface CreateUserInput {
  email: string;
  password: string;
  name?: string;
  role: Role;
  // R023: optional for `lead` role (global tenant — defaults to
  // LEAD_AGENCY_ID sentinel). Required for every other role.
  agencyId?: string;
  clientId?: string;
  mustChangePassword?: boolean;
}

export function createUser(input: CreateUserInput): ServerUser {
  const check = validatePassword(input.password);
  if (!check.ok) throw new Error(check.error ?? "Invalid password");
  const email = normEmail(input.email);
  const key = userKey(email, input.role, input.clientId);
  const now = Date.now();
  // R023: leads are global; bootstrap-agency NOT called for them. Stamp
  // the sentinel so the schema's required-string contract survives —
  // `requireAgencyScope` rejects this value at the route boundary.
  let agencyId = input.agencyId;
  if (input.role === "lead") {
    agencyId = agencyId ?? LEAD_AGENCY_ID;
  }
  if (!agencyId) {
    throw new Error(`createUser: agencyId required for role "${input.role}"`);
  }
  // R025: write both shapes. Lead = empty agencyIds (global tenant);
  // every other role gets a single-element list mirroring agencyId.
  const agencyIds = input.role === "lead" ? [] : [agencyId];
  const user: ServerUser = {
    id: makeId(),
    email,
    name: input.name ?? email.split("@")[0],
    passwordHash: hashPassword(input.password),
    role: input.role,
    agencyIds,
    agencyId,
    clientId: input.clientId,
    mustChangePassword: input.mustChangePassword,
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => {
    state.users[key] = user;
  });
  emit({ agencyId: user.agencyId, clientId: user.clientId }, "user.signed_up", { userId: user.id });
  return user;
}

// Lookup. Without a scope we hit the plain-email key (legacy behaviour
// for agency/client tiers + first-run bootstrap). With a scope hinting
// `role: "end-customer"` + `clientId` we first hit the per-client
// scoped key, then fall through to the plain-email key.
export function getUser(email: string, scope?: UserLookupScope): ServerUser | null {
  const users = getState().users;
  const e = normEmail(email);
  if (scope?.clientId && (scope.role === "end-customer" || scope.role === undefined)) {
    const scoped = users[`${e}|c:${scope.clientId}`];
    if (scoped) return scoped;
    if (scope.role === "end-customer") return null;
  }
  return users[e] ?? null;
}

export function getUserById(userId: string): ServerUser | null {
  for (const u of Object.values(getState().users)) {
    if (u.id === userId) return u;
  }
  return null;
}

const DUMMY_HASH = (() => {
  const salt = Buffer.alloc(SCRYPT_SALT_BYTES, 0);
  const derived = crypto.scryptSync("x", salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${derived.toString("hex")}`;
})();

export function verifyPassword(
  email: string,
  password: string,
  scope?: UserLookupScope,
): ServerUser | null {
  const user = getUser(email, scope);
  if (!user) {
    // Timing-equalize: still run scrypt against a dummy hash so the
    // response time matches the user-found path.
    verifyHash(password, DUMMY_HASH);
    return null;
  }
  if (!verifyHash(password, user.passwordHash)) return null;
  return user;
}

export function listUsersForAgency(agencyId: string): ServerUser[] {
  return Object.values(getState().users).filter(u => u.agencyId === agencyId);
}

export function listUsersForClient(clientId: string): ServerUser[] {
  return Object.values(getState().users).filter(u => u.clientId === clientId);
}

export function setUserPassword(
  email: string,
  password: string,
  scope?: UserLookupScope,
): boolean {
  const check = validatePassword(password);
  if (!check.ok) throw new Error(check.error ?? "Invalid password");
  const existing = getUser(email, scope);
  if (!existing) return false;
  const key = userKey(existing.email, existing.role, existing.clientId);
  let ok = false;
  mutate(state => {
    const stored = state.users[key];
    if (!stored) return;
    state.users[key] = {
      ...stored,
      passwordHash: hashPassword(password),
      mustChangePassword: false,
      sessionRev: (stored.sessionRev ?? 0) + 1, // R021: invalidate existing sessions
      updatedAt: Date.now(),
    };
    ok = true;
  });
  return ok;
}

export interface UpdateUserPatch {
  name?: string;
  role?: Role;
  clientId?: string;
  mustChangePassword?: boolean;
  // R036: profile picture data URL. `null` clears the field (DELETE
  // /api/auth/profile/avatar); `undefined` leaves it untouched.
  avatarUrl?: string | null;
}

export function updateUser(
  email: string,
  patch: UpdateUserPatch,
  scope?: UserLookupScope,
): ServerUser | null {
  const existing = getUser(email, scope);
  if (!existing) return null;
  const key = userKey(existing.email, existing.role, existing.clientId);
  let saved: ServerUser | null = null;
  mutate(state => {
    const stored = state.users[key];
    if (!stored) return;
    // R021: bump sessionRev when role or clientId changes — stale cookies
    // carrying the old role/scope fail freshness checks at the lookup layer.
    const roleOrScopeChanged =
      (patch.role !== undefined && patch.role !== stored.role) ||
      (patch.clientId !== undefined && patch.clientId !== stored.clientId);
    // R036: avatarUrl — explicit `null` clears the field; `undefined`
    // leaves the existing value untouched. Anything else is the new
    // data URL (validated upstream at the route boundary).
    const nextAvatar =
      patch.avatarUrl === undefined ? stored.avatarUrl
      : patch.avatarUrl === null ? undefined
      : patch.avatarUrl;
    saved = {
      ...stored,
      name: patch.name ?? stored.name,
      role: patch.role ?? stored.role,
      clientId: patch.clientId ?? stored.clientId,
      mustChangePassword: patch.mustChangePassword ?? stored.mustChangePassword,
      avatarUrl: nextAvatar,
      sessionRev: roleOrScopeChanged ? (stored.sessionRev ?? 0) + 1 : stored.sessionRev,
      updatedAt: Date.now(),
    };
    state.users[key] = saved;
  });
  return saved;
}

// R020: mark user's email verified — called by /api/auth/verify-email after
// HMAC token + nonce checks. Idempotent (re-marking is a no-op timestamp refresh).
export function markEmailVerified(userId: string): ServerUser | null {
  let saved: ServerUser | null = null;
  mutate(state => {
    for (const [key, u] of Object.entries(state.users)) {
      if (u.id === userId) {
        const next: ServerUser = { ...u, emailVerifiedAt: Date.now(), updatedAt: Date.now() };
        state.users[key] = next;
        saved = next;
        return;
      }
    }
  });
  return saved;
}

// R021: bump the user's session-rotation counter — call from setUserPassword
// and updateUser when role/clientId changes. Stale cookies fail the
// freshness check in `getCurrentUser` / `isSessionFresh`.
export function rotateUserSession(userId: string): ServerUser | null {
  let saved: ServerUser | null = null;
  mutate(state => {
    for (const [key, u] of Object.entries(state.users)) {
      if (u.id === userId) {
        const next: ServerUser = { ...u, sessionRev: (u.sessionRev ?? 0) + 1, updatedAt: Date.now() };
        state.users[key] = next;
        saved = next;
        return;
      }
    }
  });
  return saved;
}
