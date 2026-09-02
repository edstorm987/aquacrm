import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  createPlanHandler,
  mePortalHandler,
  meSubscribeHandler,
} from "../src/built-ins/modules/memberships/src/api/handlers";
import type { PluginCtx } from "../src/built-ins/modules/memberships/src/lib/aquaPluginTypes";
import type { Plan, Subscription } from "../src/built-ins/modules/memberships/src/lib/domain";
import {
  isMembershipCancelMutationResult,
  isMembershipPortalMutationResult,
  isMembershipSubscribeMutationResult,
} from "../src/built-ins/modules/memberships/src/lib/mutationResponses";
import {
  assertProviderCheckoutSession,
  assertProviderUrl,
} from "../src/built-ins/modules/memberships/src/lib/runtimeValidation";
import {
  applyDefaultTrialDays,
  canShowAnnualCadence,
  DEFAULT_BILLING_PORTAL_RETURN_PATH,
  DEFAULT_MEMBER_PORTAL_HEADING,
  normalizeMembershipSettings,
  planSupportsBilling,
  resolveBillingPortalReturnUrl,
} from "../src/built-ins/modules/memberships/src/lib/settings";
import {
  clearMembershipsFoundation,
  registerMembershipsFoundation,
} from "../src/built-ins/modules/memberships/src/server/foundationAdapter";
import type {
  StoragePort,
  StripeCheckoutSessionInput,
  StripePort,
} from "../src/built-ins/modules/memberships/src/server/ports";
import { numericSettingsValueError } from "../src/built-ins/runtime/_numericSettings";
import {
  describePluginSettings,
  PluginSettingsError,
  writePluginSettings,
} from "../src/lib/server/plugins/pluginSettingsSurface";
import { getInstall, upsertInstall } from "../src/server/pluginInstalls";
import { ensureHydrated } from "../src/server/storage";
import { createAgency, createClient } from "../src/server/tenants";

const AGENCY_ID = "agency_membership_settings";
const CLIENT_ID = "client_membership_settings";
const USER_ID = "user_membership_settings";

class MemoryStorage implements StoragePort {
  readonly data = new Map<string, unknown>();
  private readonly tails = new Map<string, Promise<void>>();

  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.data.get(key)) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, structuredClone(value));
  }

  async del(key: string): Promise<void> {
    this.data.delete(key);
  }

  async list(prefix = ""): Promise<string[]> {
    return [...this.data.keys()].filter(key => key.startsWith(prefix));
  }

  async runExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const tail = previous.catch(() => undefined).then(() => gate);
    this.tails.set(key, tail);
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }
}

function install(config: Record<string, unknown> = {}, features: Record<string, boolean> = {}) {
  return {
    id: "install_membership_settings",
    pluginId: "memberships",
    agencyId: AGENCY_ID,
    clientId: CLIENT_ID,
    enabled: true,
    config,
    features,
    installedAt: 1,
  };
}

function context(
  storage: MemoryStorage,
  options: {
    config?: Record<string, unknown>;
    features?: Record<string, boolean>;
    stripe?: Partial<StripePort>;
  } = {},
): PluginCtx {
  clearMembershipsFoundation();
  registerMembershipsFoundation({
    tenant: { getClient() { return null; }, getClientForAgency() { return null; } },
    user: {
      getUser(id: string) {
        return id === USER_ID ? { id, email: "member@example.test", name: "Member" } : null;
      },
    },
    activity: {
      logActivity(input: unknown) {
        return { id: `activity-${Date.now()}`, ts: Date.now(), ...(input as object) } as never;
      },
      listActivity() { return [] as never; },
    },
    events: { emit() {} },
    pluginInstalls: { getInstall() { return null; } },
    stripeFor: () => options.stripe ? options.stripe as StripePort : null,
  } as never);
  return {
    agencyId: AGENCY_ID,
    clientId: CLIENT_ID,
    actor: USER_ID,
    storage,
    install: install(options.config, options.features) as never,
    services: {} as PluginCtx["services"],
  };
}

function plan(id: string, priceAnnual: number, status: Plan["status"] = "active"): Plan {
  return {
    id,
    agencyId: AGENCY_ID,
    clientId: CLIENT_ID,
    name: id,
    priceMonthly: 1_000,
    priceAnnual,
    currency: "gbp",
    stripePriceIdMonthly: `price_month_${id}`,
    ...(priceAnnual > 0 ? { stripePriceIdAnnual: `price_annual_${id}` } : {}),
    features: [],
    benefitIds: [],
    status,
    order: 10,
    createdAt: 1,
    updatedAt: 1,
  };
}

function seedPlan(storage: MemoryStorage, value: Plan): void {
  storage.data.set("memberships/plans/index", [value.id]);
  storage.data.set(`memberships/plans/${value.id}`, structuredClone(value));
}

function seedSubscription(storage: MemoryStorage): void {
  const subscription: Subscription = {
    id: "subscription_settings",
    agencyId: AGENCY_ID,
    clientId: CLIENT_ID,
    endCustomerUserId: USER_ID,
    planId: "plan_settings",
    stripeCustomerId: "cus_settings",
    stripeSubscriptionId: "sub_settings",
    billing: "monthly",
    status: "active",
    cancelAtPeriodEnd: false,
    createdAt: 1,
    updatedAt: 1,
  };
  storage.data.set(`memberships/subscribers/${USER_ID}`, subscription);
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

describe("memberships settings normalization", () => {
  it("accepts only whole trial days from 0 through 365 and preserves declared defaults", () => {
    for (const days of [0, 1, 365]) {
      assert.equal(normalizeMembershipSettings(install({ defaultTrialDays: days })).defaultTrialDays, days);
    }
    for (const malformed of [-1, 366, 1.5, 1.0000000001, "14", null, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(
        normalizeMembershipSettings(install({ defaultTrialDays: malformed })).defaultTrialDays,
        0,
        `malformed value ${String(malformed)} did not fall back`,
      );
    }

    const defaults = normalizeMembershipSettings(install());
    assert.equal(defaults.memberPortalHeading, DEFAULT_MEMBER_PORTAL_HEADING);
    assert.equal(defaults.showAnnualToggle, true);
    assert.equal(defaults.annualBillingEnabled, false, "a missing feature flag must not enable annual checkout");

    assert.equal(
      normalizeMembershipSettings(install({ memberPortalHeading: "  Members club  " })).memberPortalHeading,
      "Members club",
    );
    assert.equal(
      normalizeMembershipSettings(install({ memberPortalHeading: "   ", showAnnualToggle: false }, { "annual-billing": true })).memberPortalHeading,
      DEFAULT_MEMBER_PORTAL_HEADING,
    );
    assert.equal(
      normalizeMembershipSettings(install({ showAnnualToggle: "false" }, { "annual-billing": true })).showAnnualToggle,
      true,
      "malformed stored booleans fall back to the manifest default",
    );
  });

  it("defaults trial days only when omitted and never converts an explicit zero to absence", () => {
    const base = { name: "Starter", priceMonthly: 0, currency: "gbp" as const };
    assert.equal(applyDefaultTrialDays(base, 14).trialDays, 14);
    assert.equal(applyDefaultTrialDays({ ...base, trialDays: 0 }, 14).trialDays, 0);
    assert.equal(applyDefaultTrialDays({ ...base, trialDays: 365 }, 14).trialDays, 365);
    assert.equal(Object.hasOwn(base, "trialDays"), false, "normalization mutated the request object");
  });

  it("refuses fractional and out-of-range trial settings at the generic settings write boundary", async () => {
    await ensureHydrated();
    const sequence = Date.now().toString(36);
    const agency = createAgency({ name: "Membership Settings Co", slug: `membership-settings-${sequence}` });
    const client = createClient(agency.id, { name: "Membership Client", slug: `membership-client-${sequence}` });
    const scope = { agencyId: agency.id, clientId: client.id };
    upsertInstall({ pluginId: "memberships", scope, enabled: true, config: {}, features: {} });

    for (const value of [-1, 366, 1.5, 1.0000000001]) {
      assert.throws(
        () => writePluginSettings({
          pluginId: "memberships",
          scope,
          values: { defaultTrialDays: value },
          actorUserId: "membership-settings-test",
        }),
        (error: unknown) => error instanceof PluginSettingsError
          && /number_(below_min|above_max|step_mismatch):defaultTrialDays/.test(error.message),
        `invalid defaultTrialDays=${value} reached install.config`,
      );
    }

    writePluginSettings({
      pluginId: "memberships",
      scope,
      values: { defaultTrialDays: 365 },
      actorUserId: "membership-settings-test",
    });
    assert.equal(getInstall(scope, "memberships")?.config.defaultTrialDays, 365);
    const field = describePluginSettings("memberships", scope)
      ?.groups.flatMap(group => group.fields)
      .find(candidate => candidate.id === "defaultTrialDays");
    assert.deepEqual(
      { min: field?.min, max: field?.max, step: field?.step },
      { min: 0, max: 365, step: 1 },
      "the settings UI did not receive the same numeric boundary the server enforces",
    );
  });

  it("uses an exact authored-decimal grid without rejecting ordinary decimal values", () => {
    assert.equal(
      numericSettingsValueError(0.3, { min: 0.1, max: 0.9, step: 0.2 }),
      null,
      "0.3 is exactly on the declared 0.1 + n*0.2 decimal grid",
    );
    assert.equal(
      numericSettingsValueError(1.0000000001, { min: 0, max: 365, step: 1 }),
      "number_step_mismatch",
      "a broad epsilon must not turn an off-grid number into an integer",
    );
  });

  it("refuses billing return URLs that the runtime would silently ignore", async () => {
    await ensureHydrated();
    const sequence = `${Date.now().toString(36)}-return-path`;
    const agency = createAgency({ name: "Membership Return Co", slug: `membership-return-${sequence}` });
    const client = createClient(agency.id, { name: "Membership Return Client", slug: `membership-return-client-${sequence}` });
    const scope = { agencyId: agency.id, clientId: client.id };
    upsertInstall({ pluginId: "memberships", scope, enabled: true, config: {}, features: {} });

    writePluginSettings({
      pluginId: "memberships",
      scope,
      values: { billingPortalReturnUrl: "/portal/customer/account?tab=billing" },
      actorUserId: "membership-settings-test",
    });
    assert.equal(
      getInstall(scope, "memberships")?.config.billingPortalReturnUrl,
      "/portal/customer/account?tab=billing",
    );

    for (const unsupported of ["https://evil.test/steal", "//evil.test/steal", "customer/account"]) {
      assert.throws(
        () => writePluginSettings({
          pluginId: "memberships",
          scope,
          values: { billingPortalReturnUrl: unsupported },
          actorUserId: "membership-settings-test",
        }),
        (error: unknown) => error instanceof PluginSettingsError
          && error.message === "same_origin_path_required:billingPortalReturnUrl",
      );
      assert.equal(
        getInstall(scope, "memberships")?.config.billingPortalReturnUrl,
        "/portal/customer/account?tab=billing",
        "a refused value replaced the last effective return path",
      );
    }
  });

  it("resolves only absolute same-origin HTTP(S) billing return targets in precedence order", () => {
    const requestUrl = "https://app.aqua.test/api/portal/memberships/me/portal";
    assert.equal(resolveBillingPortalReturnUrl({
      requestUrl,
      explicitReturnUrl: "/portal/customer/account?tab=billing",
      configuredReturnUrl: "/configured",
    }), "https://app.aqua.test/portal/customer/account?tab=billing");
    assert.equal(resolveBillingPortalReturnUrl({
      requestUrl,
      explicitReturnUrl: "https://app.aqua.test/safe",
      configuredReturnUrl: "/configured",
    }), "https://app.aqua.test/safe");

    for (const unsafe of ["javascript:alert(1)", "https://evil.test/steal", "//evil.test/steal", "https://user@app.aqua.test/steal"]) {
      assert.equal(resolveBillingPortalReturnUrl({
        requestUrl,
        explicitReturnUrl: unsafe,
        configuredReturnUrl: "/configured",
      }), "https://app.aqua.test/configured", `unsafe explicit target ${unsafe} outranked config`);
    }

    assert.equal(resolveBillingPortalReturnUrl({
      requestUrl,
      explicitReturnUrl: "javascript:alert(1)",
      configuredReturnUrl: "https://evil.test/steal",
    }), `https://app.aqua.test${DEFAULT_BILLING_PORTAL_RETURN_PATH}`);

    assert.equal(resolveBillingPortalReturnUrl({
      requestUrl: "http://localhost:3032/api/portal/memberships/me/portal",
      explicitReturnUrl: "/portal/customer/memberships",
    }), "http://localhost:3032/portal/customer/memberships");
  });

  it("accepts only credential-free HTTPS provider destinations", () => {
    assert.doesNotThrow(() => assertProviderUrl("https://checkout.stripe.test/session", "provider.url"));
    for (const malformed of [
      "http://checkout.stripe.test/session",
      "about:blank",
      "javascript:alert(1)",
      "https://user:password@checkout.stripe.test/session",
      " https://checkout.stripe.test/session ",
    ]) {
      assert.throws(
        () => assertProviderUrl(malformed, "provider.url"),
        /provider\.url:/,
        `unsafe provider destination ${malformed} passed validation`,
      );
    }
    assert.doesNotThrow(() => assertProviderCheckoutSession({
      id: "cs_valid",
      url: "https://checkout.stripe.test/session",
      expiresAt: 1_800_000_000,
    }));
    for (const malformed of [
      null,
      { id: "cs_invalid", url: "http://checkout.stripe.test/session" },
      { id: "cs_invalid", url: "https://checkout.stripe.test/session", expiresAt: 1.5 },
    ]) {
      assert.throws(() => assertProviderCheckoutSession(malformed));
    }
  });

  it("validates each membership mutation variant and its exact requested intent", () => {
    const subscription: Subscription = {
      id: "subscription_response",
      agencyId: AGENCY_ID,
      clientId: CLIENT_ID,
      endCustomerUserId: USER_ID,
      planId: "plan_expected",
      stripeCustomerId: "cus_response",
      stripeSubscriptionId: "sub_response",
      billing: "annual",
      status: "active",
      cancelAtPeriodEnd: false,
      createdAt: 1,
      updatedAt: 1,
    };
    const expected = { requestOperationId: "browser-request", planId: "plan_expected", billing: "annual" as const };

    assert.equal(isMembershipPortalMutationResult({
      ok: true,
      url: "https://billing.stripe.test/session",
    }), true);
    for (const malformed of [
      { ok: true },
      { ok: true, url: "http://billing.stripe.test/session" },
      { ok: true, url: "javascript:alert(1)" },
      { ok: true, url: "https://user:password@billing.stripe.test/session" },
    ]) {
      assert.equal(isMembershipPortalMutationResult(malformed), false);
    }

    assert.equal(isMembershipSubscribeMutationResult({
      ok: true,
      mode: "checkout",
      checkoutUrl: "https://checkout.stripe.test/session",
      operationId: "checkout-response",
      ...expected,
    }, expected), true);
    assert.equal(isMembershipSubscribeMutationResult({
      ok: true,
      mode: "checkout",
      checkoutUrl: "http://checkout.stripe.test/session",
      operationId: "checkout-response",
      ...expected,
    }, expected), false);
    for (const mismatch of [
      { requestOperationId: "another-request" },
      { planId: "plan_unrequested" },
      { billing: "monthly" },
    ]) {
      assert.equal(isMembershipSubscribeMutationResult({
        ok: true,
        mode: "checkout",
        checkoutUrl: "https://checkout.stripe.test/session",
        operationId: "checkout-response",
        ...expected,
        ...mismatch,
      }, expected), false);
    }

    for (const mode of ["free", "changed"] as const) {
      assert.equal(isMembershipSubscribeMutationResult({
        ok: true,
        mode,
        subscription,
        operationId: `${mode}-response`,
        ...expected,
      }, expected), true);
      assert.equal(isMembershipSubscribeMutationResult({
        ok: true,
        mode,
        subscription: { ...subscription, planId: "plan_unrequested" },
        operationId: `${mode}-wrong-plan`,
        ...expected,
      }, expected), false);
      assert.equal(isMembershipSubscribeMutationResult({
        ok: true,
        mode,
        subscription: { ...subscription, billing: "monthly" },
        operationId: `${mode}-wrong-cadence`,
        ...expected,
      }, expected), false);
    }

    const cancelExpected = { ...subscription, requestOperationId: "cancel-response" };
    assert.equal(isMembershipCancelMutationResult({
      ok: true,
      subscription: { ...subscription, cancelAtPeriodEnd: true },
      requestOperationId: "cancel-response",
    }, cancelExpected), true);
    assert.equal(isMembershipCancelMutationResult({
      ok: true,
      subscription: { ...subscription, status: "canceled", cancelAtPeriodEnd: false },
      requestOperationId: "cancel-response",
    }, cancelExpected), true);
    assert.equal(isMembershipCancelMutationResult({
      ok: true,
      subscription,
      requestOperationId: "cancel-response",
    }, cancelExpected), false, "an unchanged 2xx cancellation must not trigger a reload");
    assert.equal(isMembershipCancelMutationResult({
      ok: true,
      subscription: { ...subscription, id: "another-subscription", cancelAtPeriodEnd: true },
      requestOperationId: "cancel-response",
    }, cancelExpected), false);
    assert.equal(isMembershipCancelMutationResult({
      ok: true,
      subscription: { ...subscription, cancelAtPeriodEnd: true },
      requestOperationId: "another-operation",
    }, cancelExpected), false);

    for (const malformed of [
      { ok: true, mode: "checkout", checkoutUrl: "javascript:alert(1)", operationId: "bad-url" },
      { ok: true, mode: "checkout", checkoutUrl: "https://checkout.stripe.test", operationId: "" },
      { ok: true, mode: "free", operationId: "missing-subscription" },
      { ok: true, mode: "unknown", subscription, operationId: "unknown-mode" },
    ]) {
      assert.equal(isMembershipSubscribeMutationResult(malformed, expected), false);
    }
  });

  it("shows annual cadence only for the complete setting, feature, and eligible-plan gate", () => {
    const annual = plan("annual", 12_000);
    const monthly = plan("monthly", 0);
    const archivedAnnual = plan("archived", 12_000, "archived");
    assert.equal(canShowAnnualCadence({ showAnnualToggle: true, annualBillingEnabled: true }, [annual]), true);
    assert.equal(canShowAnnualCadence({ showAnnualToggle: false, annualBillingEnabled: true }, [annual]), false);
    assert.equal(canShowAnnualCadence({ showAnnualToggle: true, annualBillingEnabled: false }, [annual]), false);
    assert.equal(canShowAnnualCadence({ showAnnualToggle: true, annualBillingEnabled: true }, [monthly]), false);
    assert.equal(canShowAnnualCadence({ showAnnualToggle: true, annualBillingEnabled: true }, [archivedAnnual]), false);
    assert.equal(planSupportsBilling(monthly, "monthly"), true);
    assert.equal(planSupportsBilling(monthly, "annual"), false);
    assert.equal(planSupportsBilling(annual, "annual"), true);
  });
});

describe("memberships settings at mounted API boundaries", () => {
  it("applies the trial default before the durable fingerprint and conflicts with a changed explicit zero", async () => {
    const storage = new MemoryStorage();
    const ctx = context(storage, { config: { defaultTrialDays: 14 }, stripe: {} });
    const requestFor = (operationId: string, trialDays?: number) => new Request(
      "https://app.aqua.test/api/portal/memberships/plans",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Starter",
          priceMonthly: 0,
          currency: "gbp",
          operationId,
          ...(trialDays === undefined ? {} : { trialDays }),
        }),
      },
    );

    const createdResponse = await createPlanHandler(requestFor("trial-default-operation"), ctx);
    const createdBody = await responseBody(createdResponse);
    assert.equal(createdResponse.status, 201);
    assert.equal((createdBody.plan as Plan).trialDays, 14);

    const replayResponse = await createPlanHandler(requestFor("trial-default-operation"), ctx);
    const replayBody = await responseBody(replayResponse);
    assert.equal(replayResponse.status, 201);
    assert.equal((replayBody.plan as Plan).id, (createdBody.plan as Plan).id);

    const changedIntent = await createPlanHandler(requestFor("trial-default-operation", 0), ctx);
    assert.equal(changedIntent.status, 409, "explicit zero was erased before the durable signature");

    const explicitZero = await createPlanHandler(requestFor("trial-zero-operation", 0), ctx);
    assert.equal(explicitZero.status, 201);
    const explicitZeroBody = await responseBody(explicitZero);
    assert.equal((explicitZeroBody.plan as Plan).trialDays, 0);

    const invalid = await createPlanHandler(requestFor("trial-invalid-operation", 366), ctx);
    assert.equal(invalid.status, 422);
    assert.match(String((await responseBody(invalid)).error), /trialDays.*0 to 365/);
  });

  it("passes the resolved absolute billing return URL to the provider", async () => {
    const storage = new MemoryStorage();
    seedSubscription(storage);
    const received: string[] = [];
    const stripe = {
      async createBillingPortalSession(input: { customerId: string; returnUrl: string }) {
        received.push(input.returnUrl);
        return { id: `bps_${received.length}`, url: "https://billing.stripe.test/session" };
      },
    };
    const ctx = context(storage, {
      config: { billingPortalReturnUrl: "/portal/customer/configured" },
      stripe,
    });

    const call = async (returnUrl?: string) => mePortalHandler(new Request(
      "https://app.aqua.test/api/portal/memberships/me/portal",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(returnUrl === undefined ? {} : { returnUrl }),
      },
    ), ctx);

    assert.equal((await call("/portal/customer/explicit")).status, 200);
    assert.equal(received.at(-1), "https://app.aqua.test/portal/customer/explicit");
    assert.equal((await call("javascript:alert(1)")).status, 200);
    assert.equal(received.at(-1), "https://app.aqua.test/portal/customer/configured");

    ctx.install.config.billingPortalReturnUrl = "https://evil.test/steal";
    assert.equal((await call("https://evil.test/steal")).status, 200);
    assert.equal(received.at(-1), `https://app.aqua.test${DEFAULT_BILLING_PORTAL_RETURN_PATH}`);
  });

  it("rejects disabled and ineligible annual requests, then sends exact annual cadence to Stripe", async () => {
    const storage = new MemoryStorage();
    const annualPlan = plan("plan_annual", 12_000);
    seedPlan(storage, annualPlan);
    let checkoutInput: StripeCheckoutSessionInput | null = null;
    const stripe = {
      async createCustomer() { return { id: "cus_annual", email: "member@example.test" }; },
      async createCheckoutSession(input: StripeCheckoutSessionInput) {
        checkoutInput = structuredClone(input);
        return { id: "cs_annual", url: "https://checkout.stripe.test/annual" };
      },
    };
    const request = (
      billing: string,
      operationId: string,
      urls: { successUrl?: string; cancelUrl?: string } = {},
    ) => new Request(
      "https://app.aqua.test/api/portal/memberships/me/subscribe",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId: annualPlan.id, billing, operationId, ...urls }),
      },
    );

    const disabledCtx = context(storage, { features: { "annual-billing": false }, stripe });
    const disabled = await meSubscribeHandler(request("annual", "annual-disabled"), disabledCtx);
    assert.equal(disabled.status, 422);
    assert.equal(checkoutInput, null);

    const hiddenCtx = context(storage, {
      config: { showAnnualToggle: false },
      features: { "annual-billing": true },
      stripe,
    });
    const hidden = await meSubscribeHandler(request("annual", "annual-hidden"), hiddenCtx);
    assert.equal(hidden.status, 422);
    assert.equal(checkoutInput, null);

    const malformed = await meSubscribeHandler(request("weekly", "annual-malformed"), disabledCtx);
    assert.equal(malformed.status, 400);

    const enabledCtx = context(storage, { features: { "annual-billing": true }, stripe });
    const annual = await meSubscribeHandler(request("annual", "annual-enabled"), enabledCtx);
    const annualBody = await responseBody(annual);
    assert.equal(annual.status, 200);
    assert.equal(annualBody.mode, "checkout");
    assert.equal(checkoutInput?.priceId, annualPlan.stripePriceIdAnnual);
    assert.equal(checkoutInput?.metadata?.billing, "annual");

    const reusedForChangedIntent = await meSubscribeHandler(request(
      "annual",
      "annual-enabled",
      { successUrl: "https://app.aqua.test/changed-success" },
    ), enabledCtx);
    assert.equal(reusedForChangedIntent.status, 409);
    assert.equal((await responseBody(reusedForChangedIntent)).operationId, "annual-enabled");

    const ineligibleStorage = new MemoryStorage();
    const monthlyOnly = plan("plan_monthly_only", 0);
    seedPlan(ineligibleStorage, monthlyOnly);
    const ineligibleCtx = context(ineligibleStorage, { features: { "annual-billing": true }, stripe });
    const ineligible = await meSubscribeHandler(new Request(
      "https://app.aqua.test/api/portal/memberships/me/subscribe",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId: monthlyOnly.id, billing: "annual", operationId: "annual-ineligible" }),
      },
    ), ineligibleCtx);
    assert.equal(ineligible.status, 422);
    assert.match(String((await responseBody(ineligible)).error), /not available with annual billing/);
  });
});

it("mounts all four settings on the actual admin/customer/API paths", async () => {
  const root = process.cwd();
  const [plansPage, planModal, memberPage, memberPanel, handlers, tracker] = await Promise.all([
    readFile(join(root, "src/built-ins/modules/memberships/src/pages/PlansPage.tsx"), "utf8"),
    readFile(join(root, "src/built-ins/modules/memberships/src/components/NewPlanModal.tsx"), "utf8"),
    readFile(join(root, "src/built-ins/modules/memberships/src/pages/MyMembershipPage.tsx"), "utf8"),
    readFile(join(root, "src/built-ins/modules/memberships/src/components/MyMembershipPanel.tsx"), "utf8"),
    readFile(join(root, "src/built-ins/modules/memberships/src/api/handlers.ts"), "utf8"),
    readFile(join(root, "src/lib/plugins/unwiredSettings.ts"), "utf8"),
  ]);
  assert.match(plansPage, /normalizeMembershipSettings\(props\.install\)/);
  assert.match(planModal, /trialDays: Number\(/);
  assert.match(planModal, /max="365" step="1" required defaultValue=\{defaultTrialDays\}/);
  assert.match(memberPage, /canShowAnnualCadence\(settings, plans\)/);
  assert.match(memberPanel, /<fieldset className="memberships-cadence">/);
  assert.match(memberPanel, /billing,\s*operationId:/);
  assert.match(memberPanel, /validate: isMembershipPortalMutationResult/);
  assert.match(memberPanel, /isMembershipCancelMutationResult\(payload, \{/);
  assert.match(memberPanel, /pendingMembershipOperationId/);
  assert.match(memberPanel, /clearPendingMembershipOperation/);
  assert.match(memberPanel, /isMembershipSubscribeMutationResult\(payload, \{ requestOperationId, planId, billing \}\)/);
  assert.match(handlers, /requestOperationId: body\.operationId/);
  assert.match(handlers, /retryableFailure\(err instanceof Error \? err\.message : String\(err\), body\.operationId\)/);
  assert.match(handlers, /planId: result\.planId/);
  assert.match(handlers, /billing: result\.billing/);
  assert.match(handlers, /applyDefaultTrialDays\(suppliedInput, settings\.defaultTrialDays\)/);
  assert.match(handlers, /resolveBillingPortalReturnUrl\(\{/);
  assert.match(handlers, /requestOperationId: body\.operationId/);
  for (const fieldId of ["defaultTrialDays", "billingPortalReturnUrl", "memberPortalHeading", "showAnnualToggle"]) {
    assert.doesNotMatch(
      tracker,
      new RegExp(`pluginId: ["']memberships["'], fieldId: ["']${fieldId}["']`),
      `${fieldId} remains falsely labelled as unwired`,
    );
  }
});
