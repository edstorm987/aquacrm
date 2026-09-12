import "server-only";

import crypto from "node:crypto";

import { signVerifyEmailPayload, type VerifyEmailPayload, consumeVerifyNonce } from "@/lib/server/auth/emailVerification";
import { resolveSigningSecret } from "@/lib/server/auth/sessionToken";
import { provisionOrAdoptSupabaseIdentity } from "@/lib/supabase/admin";
import { bootstrapAgency } from "./agencyBootstrap";
import { ensureHydrated, flushPendingWrites, getState, mutate } from "./storage";
import { getAgency } from "./tenants";
import type { AgencySignupOperation, ServerUser } from "./types";
import {
  bindSupabaseAuthIdentity,
  createUser,
  getUser,
  getUserById,
  markEmailVerified,
  validatePassword,
} from "./users";
import { withPortalProviderLease, withPortalStateTransaction } from "./productWorkspaceCoordinator";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1_000;
const SETUP_TTL_MS = 30 * 60 * 1_000;
const DELIVERY_COOLDOWN_MS = 60_000;
export const AGENCY_SIGNUP_TERMS_VERSION = "2026-09-12";

export const AGENCY_SIGNUP_SETUP_COOKIE = "aqua_agency_signup_setup";

interface SetupPayload {
  purpose: "agency-signup-setup";
  operationId: string;
  userId: string;
  email: string;
  nonce: string;
  exp: number;
}

export interface PreparedAgencySignup {
  accepted: true;
  operation?: AgencySignupOperation;
  verificationToken?: string;
  shouldDeliver: boolean;
}

export interface AgencySignupDeliveryResult {
  delivered: boolean;
  externalMessageId?: string;
  outcomeUnknown?: boolean;
  unavailable?: boolean;
}

export interface AgencySignupActivationDependencies {
  provisionProvider(input: {
    operationId: string;
    email: string;
    password: string;
    name: string;
    agencyId: string;
  }): Promise<{ id: string }>;
}

export interface AgencySignupConsentEvidence {
  acceptedAt: number;
  policy: "agency-self-service-terms";
  version: string;
  termsUrl: string;
}

function canonicalEmail(email: string): string {
  return email.trim().toLowerCase();
}

function digest(...parts: string[]): string {
  return crypto.createHash("sha256").update(parts.join("\u0000")).digest("hex");
}

function operationKey(email: string): string {
  return `agency_signup_${digest("agency-signup", canonicalEmail(email)).slice(0, 32)}`;
}

function companySlug(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "agency";
}

function intentFingerprint(email: string, companyName: string): string {
  return digest("agency-signup-intent", canonicalEmail(email), companyName.trim());
}

function activationPasswordFingerprint(operationId: string, password: string): string {
  return crypto.createHmac("sha256", resolveSigningSecret())
    .update("agency-signup-password-v1")
    .update("\0")
    .update(operationId)
    .update("\0")
    .update(password)
    .digest("hex");
}

function writeOperation(operation: AgencySignupOperation): void {
  mutate(state => {
    state.agencySignupOperations[operation.id] = operation;
  });
}

function currentOperation(operationId: string): AgencySignupOperation | null {
  return getState().agencySignupOperations[operationId] ?? null;
}

function sameVerification(operation: AgencySignupOperation, payload: VerifyEmailPayload): boolean {
  return payload.purpose === "agency-signup-email-verify"
    && operation.userId === payload.userId
    && operation.email === canonicalEmail(payload.email)
    && operation.verificationNonce === payload.nonce
    && operation.verificationExpiresAt === payload.exp;
}

function encodeSetupPayload(payload: SetupPayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", resolveSigningSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyAgencySignupSetupToken(token: string):
  | { ok: true; payload: SetupPayload }
  | { ok: false; error: string } {
  const dot = token.indexOf(".");
  if (dot <= 0) return { ok: false, error: "malformed_setup_token" };
  const body = token.slice(0, dot);
  const supplied = Buffer.from(token.slice(dot + 1), "utf8");
  const expected = Buffer.from(
    crypto.createHmac("sha256", resolveSigningSecret()).update(body).digest("base64url"),
    "utf8",
  );
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    return { ok: false, error: "invalid_setup_token" };
  }
  let payload: SetupPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SetupPayload;
  } catch {
    return { ok: false, error: "malformed_setup_payload" };
  }
  if (
    payload.purpose !== "agency-signup-setup"
    || !payload.operationId
    || !payload.userId
    || !payload.email
    || !payload.nonce
    || !payload.exp
  ) {
    return { ok: false, error: "missing_setup_claims" };
  }
  if (payload.exp < Math.floor(Date.now() / 1_000)) return { ok: false, error: "setup_expired" };
  return { ok: true, payload: { ...payload, email: canonicalEmail(payload.email) } };
}

export async function prepareAgencySignup(input: {
  email: string;
  companyName: string;
  consent: AgencySignupConsentEvidence;
  now?: number;
}): Promise<PreparedAgencySignup> {
  const email = canonicalEmail(input.email);
  const companyName = input.companyName.trim();
  const now = input.now ?? Date.now();
  if (
    input.consent.policy !== "agency-self-service-terms"
    || input.consent.version !== AGENCY_SIGNUP_TERMS_VERSION
    || !Number.isSafeInteger(input.consent.acceptedAt)
    || input.consent.acceptedAt > now + 60_000
  ) throw new Error("agency_signup_consent_invalid");
  let consentTermsUrl: string;
  try {
    const parsed = new URL(input.consent.termsUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
    consentTermsUrl = parsed.toString();
  } catch {
    throw new Error("agency_signup_consent_invalid");
  }
  const id = operationKey(email);
  return withPortalStateTransaction(`agency-signup:${id}`, () => {
    // Anti-enumeration: an existing account gets the same accepted response but
    // never another email and never a second tenant.
    if (getUser(email)) return { accepted: true, shouldDeliver: false };

    const existing = currentOperation(id);
    if (existing?.stage === "complete") return { accepted: true, shouldDeliver: false };
    const tokenExpired = !existing || existing.verificationExpiresAt * 1_000 <= now;
    const setupExpired = (existing?.stage === "email-verified" || existing?.stage === "verification-claiming")
      && (!existing.setupExpiresAt || existing.setupExpiresAt <= now);
    const needsFreshVerification = tokenExpired || setupExpired;
    const fingerprint = intentFingerprint(email, companyName);

    // While a live request owns this mailbox, a public replay cannot rewrite
    // the company details. The mailbox holder may start again after expiry.
    if (existing && !tokenExpired && existing.intentFingerprint !== fingerprint) {
      return { accepted: true, shouldDeliver: false };
    }
    if (existing && existing.stage !== "awaiting-email-verification" && !setupExpired) {
      return { accepted: true, shouldDeliver: false };
    }
    if (
      existing
      && !tokenExpired
      && existing.deliveryLastAttemptAt
      && existing.deliveryLastAttemptAt + DELIVERY_COOLDOWN_MS > now
    ) {
      return {
        accepted: true,
        operation: existing,
        verificationToken: signVerifyEmailPayload({
          purpose: "agency-signup-email-verify",
          userId: existing.userId,
          email: existing.email,
          nonce: existing.verificationNonce,
          exp: existing.verificationExpiresAt,
        }),
        shouldDeliver: false,
      };
    }

    const userId = existing?.userId ?? `usr_signup_${digest("agency-signup-user", id).slice(0, 20)}`;
    const signed = needsFreshVerification
      ? (() => {
          const payload: VerifyEmailPayload & { purpose: "agency-signup-email-verify" } = {
            purpose: "agency-signup-email-verify",
            userId,
            email,
            nonce: crypto.randomBytes(16).toString("base64url"),
            exp: Math.floor((now + VERIFICATION_TTL_MS) / 1_000),
          };
          return { payload, token: signVerifyEmailPayload(payload) };
        })()
      : {
          payload: {
            purpose: "agency-signup-email-verify" as const,
            userId,
            email,
            nonce: existing!.verificationNonce,
            exp: existing!.verificationExpiresAt,
          },
          token: signVerifyEmailPayload({
            purpose: "agency-signup-email-verify",
            userId,
            email,
            nonce: existing!.verificationNonce,
            exp: existing!.verificationExpiresAt,
          }),
        };
    const hashSuffix = digest("agency-signup-agency", id).slice(0, 10);
    // A pending receipt (process died around the call) or explicit ambiguous
    // provider result may already have sent the email. Retrying the same
    // generation preserves the exact Resend idempotency key; a definitive
    // failure starts a new generation after the cooldown.
    const retrySameProviderOperation = !needsFreshVerification && (
      existing?.deliveryStatus === "pending"
      || (existing?.deliveryStatus === "failed" && existing.deliveryOutcomeUnknown === true)
    );
    const operation: AgencySignupOperation = {
      id,
      email,
      companyName,
      intentFingerprint: fingerprint,
      userId,
      agencyId: existing?.agencyId ?? `${companySlug(companyName)}-${hashSuffix}`,
      consentAcceptedAt: existing?.consentAcceptedAt ?? input.consent.acceptedAt,
      consentPolicy: "agency-self-service-terms",
      consentPolicyVersion: existing?.consentPolicyVersion ?? input.consent.version,
      consentTermsUrl: existing?.consentTermsUrl ?? consentTermsUrl,
      stage: "awaiting-email-verification",
      verificationNonce: signed.payload.nonce,
      verificationExpiresAt: signed.payload.exp,
      deliveryGeneration: retrySameProviderOperation
        ? existing!.deliveryGeneration
        : (existing?.deliveryGeneration ?? 0) + 1,
      deliveryStatus: "pending",
      deliveryAttempts: (existing?.deliveryAttempts ?? 0) + 1,
      deliveryLastAttemptAt: now,
      deliveryOutcomeUnknown: undefined,
      setupNonce: needsFreshVerification ? undefined : existing?.setupNonce,
      setupExpiresAt: needsFreshVerification ? undefined : existing?.setupExpiresAt,
      activationAttempts: existing?.activationAttempts ?? 0,
      verifiedAt: needsFreshVerification ? undefined : existing?.verifiedAt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    writeOperation(operation);
    return { accepted: true, operation, verificationToken: signed.token, shouldDeliver: true };
  });
}

export async function recordAgencySignupDelivery(
  operationId: string,
  generation: number,
  result: AgencySignupDeliveryResult,
  now = Date.now(),
): Promise<void> {
  await withPortalStateTransaction(`agency-signup:${operationId}`, () => {
    const operation = currentOperation(operationId);
    if (!operation || operation.deliveryGeneration !== generation || operation.stage !== "awaiting-email-verification") return;
    if (operation.deliveryStatus === "delivered" && !result.delivered) return;
    writeOperation({
      ...operation,
      deliveryStatus: result.delivered ? "delivered" : "failed",
      deliveryExternalMessageId: result.delivered ? result.externalMessageId : undefined,
      deliveryLastError: result.delivered
        ? undefined
        : result.unavailable ? "delivery_unavailable" : "provider_failed",
      deliveryOutcomeUnknown: result.delivered ? undefined : result.outcomeUnknown === true,
      updatedAt: now,
    });
  });
}

export interface AgencySignupVerificationDependencies {
  consumeNonce?: typeof consumeVerifyNonce;
  /** Test-only crash seam proving recovery after the durable nonce wins. */
  afterNonceConsumed?: () => void | Promise<void>;
}

export async function claimAgencySignupVerification(
  payload: VerifyEmailPayload,
  now = Date.now(),
  dependencies: AgencySignupVerificationDependencies = {},
): Promise<
  | { ok: true; state: "setup-required"; setupToken: string }
  | { ok: true; state: "complete" }
  | { ok: false; error: string }
> {
  if (payload.purpose !== "agency-signup-email-verify") {
    return { ok: false, error: "invalid_verification_purpose" };
  }
  const id = operationKey(payload.email);
  if (payload.exp * 1_000 <= now) return { ok: false, error: "verification_expired" };
  return withPortalProviderLease(`agency-signup-verification:${id}`, async () => {
    await ensureHydrated({ fresh: true });
    let operation = currentOperation(id);
    if (!operation || !sameVerification(operation, payload)) return { ok: false, error: "signup_not_found" };
    if (operation.stage === "complete") return { ok: true, state: "complete" };

    if (
      operation.stage !== "awaiting-email-verification"
      && operation.stage !== "verification-claiming"
      && operation.stage !== "email-verified"
    ) {
      return { ok: false, error: "signup_state_invalid" };
    }

    const setupStillLive = operation.setupNonce
      && operation.setupExpiresAt
      && operation.setupExpiresAt > now;
    if ((operation.stage === "email-verified" || operation.stage === "verification-claiming") && !setupStillLive) {
      // The email proof bought one short setup window, not an evergreen setup
      // token factory. A fresh challenged request must mint and deliver a new
      // verification generation.
      return { ok: false, error: "setup_expired" };
    }
    if (operation.stage === "awaiting-email-verification") {
      operation = await withPortalStateTransaction(`agency-signup:${id}`, () => {
        const current = currentOperation(id);
        if (!current || !sameVerification(current, payload)) throw new Error("signup_state_changed");
        if (current.stage !== "awaiting-email-verification") return current;
        const claiming: AgencySignupOperation = {
          ...current,
          stage: "verification-claiming",
          setupNonce: crypto.randomBytes(16).toString("base64url"),
          setupExpiresAt: Math.floor((now + SETUP_TTL_MS) / 1_000) * 1_000,
          updatedAt: now,
        };
        writeOperation(claiming);
        return claiming;
      });
      // This intent must outlive the process before the cross-instance nonce is
      // consumed. A crash after consumption can then finish only this exact
      // operation/nonce/setup receipt on retry.
      await flushPendingWrites();
    }

    if (operation.stage === "verification-claiming") {
      const consumed = await (dependencies.consumeNonce ?? consumeVerifyNonce)(payload.nonce, payload.exp);
      if (!consumed) {
        const recovery = currentOperation(id);
        if (!recovery || recovery.stage !== "verification-claiming" || !sameVerification(recovery, payload)) {
          return { ok: false, error: "already_used" };
        }
      } else {
        await dependencies.afterNonceConsumed?.();
      }
      operation = await withPortalStateTransaction(`agency-signup:${id}`, () => {
        const current = currentOperation(id);
        if (!current || current.stage !== "verification-claiming" || !sameVerification(current, payload)) {
          throw new Error("signup_state_changed");
        }
        const verified: AgencySignupOperation = {
          ...current,
          stage: "email-verified",
          verifiedAt: current.verifiedAt ?? now,
          updatedAt: now,
        };
        writeOperation(verified);
        return verified;
      });
      await flushPendingWrites();
    }

    const next = operation;
    if (!next.setupNonce || !next.setupExpiresAt) return { ok: false, error: "signup_state_invalid" };
    return {
      ok: true,
      state: "setup-required",
      setupToken: encodeSetupPayload({
        purpose: "agency-signup-setup",
        operationId: next.id,
        userId: next.userId,
        email: next.email,
        nonce: next.setupNonce,
        exp: Math.floor(next.setupExpiresAt / 1_000),
      }),
    };
  });
}

function exactSetupOperation(payload: SetupPayload): AgencySignupOperation | null {
  const operation = currentOperation(payload.operationId);
  if (
    !operation
    || operation.userId !== payload.userId
    || operation.email !== payload.email
    || operation.setupNonce !== payload.nonce
    || operation.setupExpiresAt !== payload.exp * 1_000
  ) return null;
  return operation;
}

const defaultActivationDependencies: AgencySignupActivationDependencies = {
  provisionProvider: async input => {
    const result = await provisionOrAdoptSupabaseIdentity({
      operationId: input.operationId,
      email: input.email,
      password: input.password,
      name: input.name,
      agencyId: input.agencyId,
      role: "owner",
    });
    return { id: result.user.id };
  },
};

export async function activateAgencySignup(input: {
  setupToken: string;
  password: string;
  dependencies?: AgencySignupActivationDependencies;
}): Promise<{
  operation: AgencySignupOperation;
  user: ServerUser;
  resumed: boolean;
  completedNow: boolean;
}> {
  const verified = verifyAgencySignupSetupToken(input.setupToken);
  if (!verified.ok) throw new Error(verified.error);
  const passwordCheck = validatePassword(input.password);
  if (!passwordCheck.ok) throw new Error(passwordCheck.error ?? "Invalid password.");
  const payload = verified.payload;
  const dependencies = input.dependencies ?? defaultActivationDependencies;
  const passwordFingerprint = activationPasswordFingerprint(payload.operationId, input.password);

  return withPortalProviderLease(`agency-signup:${payload.operationId}`, async () => {
    await ensureHydrated({ fresh: true });
    let operation = exactSetupOperation(payload);
    if (!operation) throw new Error("signup_setup_invalid");
    if (
      operation.activationPasswordFingerprint
      && operation.activationPasswordFingerprint !== passwordFingerprint
    ) throw new Error("signup_password_changed");
    if (operation.stage === "complete") {
      const user = getUserById(operation.userId);
      if (!user || user.agencyId !== operation.agencyId || user.role !== "agency-owner") {
        throw new Error("signup_completion_inconsistent");
      }
      // Lost-response recovery converges without turning the setup capability
      // into a reusable session-minting credential. The mounted route sends
      // this replay to normal sign-in and clears the setup cookie.
      return { operation, user, resumed: true, completedNow: false };
    }
    if (operation.stage !== "email-verified" && operation.stage !== "provider-ready") {
      throw new Error("mailbox_verification_required");
    }

    const resumed = operation.activationAttempts > 0;
    operation = await withPortalStateTransaction(`agency-signup:${operation.id}`, () => {
      const current = exactSetupOperation(payload);
      if (!current || (current.stage !== "email-verified" && current.stage !== "provider-ready")) {
        throw new Error("signup_state_changed");
      }
      const next: AgencySignupOperation = {
        ...current,
        activationPasswordFingerprint: current.activationPasswordFingerprint ?? passwordFingerprint,
        activationAttempts: current.activationAttempts + 1,
        activationLastError: undefined,
        updatedAt: Date.now(),
      };
      writeOperation(next);
      return next;
    });
    // Password binding and attempt receipt must survive before the provider is
    // touched; otherwise a lost response could be retried with different input.
    await flushPendingWrites();
    try {
      if (operation.stage === "email-verified") {
        const provider = await dependencies.provisionProvider({
          operationId: operation.id,
          email: operation.email,
          password: input.password,
          name: operation.email.split("@")[0] ?? operation.companyName,
          agencyId: operation.agencyId,
        });
        operation = await withPortalStateTransaction(`agency-signup:${operation.id}`, () => {
          const current = exactSetupOperation(payload);
          if (!current || current.stage !== "email-verified") throw new Error("signup_state_changed");
          const next: AgencySignupOperation = {
            ...current,
            stage: "provider-ready",
            providerUserId: provider.id,
            activationLastError: undefined,
            updatedAt: Date.now(),
          };
          writeOperation(next);
          return next;
        });
        await flushPendingWrites();
      }

      const completed = await withPortalStateTransaction(`agency-signup:${operation.id}`, async () => {
        const current = exactSetupOperation(payload);
        if (!current || current.stage !== "provider-ready" || !current.providerUserId) {
          throw new Error("signup_provider_receipt_missing");
        }
        const existingAgency = getAgency(current.agencyId);
        if (existingAgency) throw new Error("signup_agency_id_conflict");
        const existingUser = getUser(current.email);
        if (existingUser) throw new Error("signup_email_conflict");

        const { agency } = await bootstrapAgency({
          name: current.companyName,
          ownerEmail: current.email,
          slug: current.agencyId,
        }, current.userId);
        if (agency.id !== current.agencyId) throw new Error("signup_agency_id_conflict");

        const created = createUser({
          id: current.userId,
          email: current.email,
          password: input.password,
          role: "agency-owner",
          agencyId: agency.id,
          name: current.email.split("@")[0] ?? current.companyName,
        });
        const bound = bindSupabaseAuthIdentity(created.id, current.providerUserId);
        if (!bound) throw new Error("signup_provider_binding_failed");
        const user = markEmailVerified(bound.id);
        if (!user) throw new Error("signup_email_verification_failed");

        const next: AgencySignupOperation = {
          ...current,
          stage: "complete",
          activationLastError: undefined,
          completedAt: Date.now(),
          updatedAt: Date.now(),
        };
        writeOperation(next);
        return { operation: next, user };
      });
      await flushPendingWrites();
      return { ...completed, resumed, completedNow: true };
    } catch (error) {
      const internalCode = error instanceof Error && /^signup_[a-z0-9_]+$/.test(error.message)
        ? error.message
        : "signup_activation_failed";
      try {
        await withPortalStateTransaction(`agency-signup:${payload.operationId}`, () => {
          const current = exactSetupOperation(payload);
          if (!current || current.stage === "complete") return;
          writeOperation({
            ...current,
            // Never persist provider/configuration messages in the portal
            // document; only stable application-owned categories are safe.
            activationLastError: internalCode,
            updatedAt: Date.now(),
          });
        });
      } catch {
        // The original failure is the useful one. The stable provider operation
        // marker lets the next request adopt and resume even if this note failed.
      }
      throw error;
    }
  });
}

export function getAgencySignupOperation(email: string): AgencySignupOperation | null {
  return currentOperation(operationKey(email));
}
