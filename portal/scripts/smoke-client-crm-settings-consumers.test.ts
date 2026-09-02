// Settings truthfulness (issue #44) — the final pass.
//
// Five declarations whose own help text said "value stored, not enforced" are
// gone rather than kept as promises: HR's leave auto-restore and PTO budget,
// Affiliates' payout cadence and auto-approve window, Client CRM's freeform
// custom-attribute schema. Client CRM's two retained fields now have real
// consumers: `defaultTags` is applied to a Contact created without tags of its
// own, and `autoCreateOnSignup` gates whether the customer profile page mirrors
// a signed-in customer with no Contact into one. Three safety-shaped controls
// remain listed as unwired on purpose.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildClientCrmContainer,
  readClientCrmSettings,
  type ClientCrmSettings,
} from "../src/built-ins/modules/client-crm/src/server/index";
import type {
  ActivityLogPort,
  EventBusPort,
  PluginInstallStorePort,
  TenantPort,
  UserPort,
} from "../src/built-ins/modules/client-crm/src/server/ports";
import type { PluginStorage } from "../src/built-ins/modules/client-crm/src/lib/aquaPluginTypes";
import { UNWIRED_SETTINGS } from "../src/lib/plugins/unwiredSettings";

const AGENCY_ID = "agency_crm_settings";
const CLIENT_ID = "client_crm_settings";
const USER_NEW = "usr_new";
const USER_KNOWN = "usr_known";

function world(settings?: ClientCrmSettings) {
  const data = new Map<string, unknown>();
  const storage: PluginStorage = {
    async get<T = unknown>(key: string): Promise<T | undefined> { return data.get(key) as T | undefined; },
    async set<T = unknown>(key: string, value: T): Promise<void> { data.set(key, value); },
    async del(key: string): Promise<void> { data.delete(key); },
    async list(prefix?: string): Promise<string[]> { const keys = [...data.keys()]; return prefix ? keys.filter(key => key.startsWith(prefix)) : keys; },
  };
  const profiles = {
    [USER_NEW]: { id: USER_NEW, email: "new@crm-settings.test", name: "New Customer", agencyId: AGENCY_ID, clientId: CLIENT_ID },
    [USER_KNOWN]: { id: USER_KNOWN, email: "known@crm-settings.test", name: "Known Customer", agencyId: AGENCY_ID, clientId: CLIENT_ID },
  } as const;
  const user: UserPort = {
    getUser: id => profiles[id as keyof typeof profiles] ?? null,
    getUserByEmail: ({ email }) => Object.values(profiles).find(profile => profile.email.toLowerCase() === email.toLowerCase()) ?? null,
  };
  const tenant: TenantPort = {
    getClient: () => null,
    getClientForAgency: () => null,
  };
  const activity: ActivityLogPort = {
    logActivity: input => ({ id: "activity", ts: Date.now(), ...input }) as never,
    listActivity: () => [],
  };
  const events: EventBusPort = { emit() {} };
  const pluginInstalls: PluginInstallStorePort = { getInstall: () => null };
  return buildClientCrmContainer({ agencyId: AGENCY_ID as never, clientId: CLIENT_ID as never, storage, activity, events, tenant, user, pluginInstalls, settings });
}

describe("Client CRM settings are consumed", () => {
  it("normalises defaultTags into a trimmed, capped, case-insensitively unique list and reads the signup toggle with a truthful default", () => {
    assert.deepEqual(readClientCrmSettings(undefined), { defaultTags: [], autoCreateOnSignup: true });
    assert.deepEqual(readClientCrmSettings({}), { defaultTags: [], autoCreateOnSignup: true });
    assert.deepEqual(readClientCrmSettings({ defaultTags: " vip , trial,VIP,, newsletter " }), { defaultTags: ["vip", "trial", "newsletter"], autoCreateOnSignup: true });
    assert.deepEqual(readClientCrmSettings({ defaultTags: 7, autoCreateOnSignup: false }), { defaultTags: [], autoCreateOnSignup: false });
    assert.deepEqual(readClientCrmSettings({ autoCreateOnSignup: "no" }), { defaultTags: [], autoCreateOnSignup: true });
    assert.equal(readClientCrmSettings({ defaultTags: "x".repeat(100) }).defaultTags[0].length, 60);
  });

  it("applies default tags only to a Contact created without tags of its own", async () => {
    const configured = world({ defaultTags: ["vip", "newsletter"], autoCreateOnSignup: true });
    const tagged = await configured.contacts.create({ email: "a@crm-settings.test" }, "agent" as never);
    assert.deepEqual(tagged.tags, ["vip", "newsletter"]);
    const explicit = await configured.contacts.create({ email: "b@crm-settings.test", tags: ["partner"] }, "agent" as never);
    assert.deepEqual(explicit.tags, ["partner"], "explicit tags are the caller's");
    const emptyList = await configured.contacts.create({ email: "c@crm-settings.test", tags: [] }, "agent" as never);
    assert.deepEqual(emptyList.tags, ["vip", "newsletter"], "an empty list means no tags of its own");
    const unset = world();
    const plain = await unset.contacts.create({ email: "d@crm-settings.test" }, "agent" as never);
    assert.deepEqual(plain.tags, [], "no setting, no tags");
    // The signup mirror is a creation too, so it carries the defaults as well.
    const mirrored = await configured.contacts.mergeFromUser(USER_NEW as never, USER_NEW as never);
    assert.deepEqual(mirrored?.tags, ["vip", "newsletter"]);
    assert.equal(mirrored?.source, "signup");
  });

  it("autoCreateOnSignup off still links an existing Contact but creates none for an unknown customer", async () => {
    const gated = world({ defaultTags: [], autoCreateOnSignup: false });
    assert.equal(await gated.contacts.mergeFromUser(USER_NEW as never, USER_NEW as never), null, "no Contact is invented when the toggle is off");
    assert.equal(await gated.contacts.getByUser(USER_NEW as never), null);
    const existing = await gated.contacts.create({ email: "known@crm-settings.test", name: "Known" }, "agent" as never);
    const linked = await gated.contacts.mergeFromUser(USER_KNOWN as never, USER_KNOWN as never);
    assert.equal(linked?.id, existing.id, "an existing Contact is still reconciled to the signed-in customer");
    assert.equal(linked?.endCustomerUserId, USER_KNOWN);
    const open = world({ defaultTags: [], autoCreateOnSignup: true });
    const created = await open.contacts.mergeFromUser(USER_NEW as never, USER_NEW as never);
    assert.equal(created?.email, "new@crm-settings.test", "with the toggle on (the default) the Contact is created");
  });

  it("removes the five stored-only promises and leaves exactly the three safety-shaped controls unwired", () => {
    const hr = readFileSync("src/built-ins/modules/agency-hr/index.ts", "utf8");
    const affiliates = readFileSync("src/built-ins/modules/affiliates/index.ts", "utf8");
    const crm = readFileSync("src/built-ins/modules/client-crm/index.ts", "utf8");
    for (const [source, field] of [
      [hr, "leaveAutoRestoreDays"], [hr, "defaultPtoDaysPerYear"],
      [affiliates, "payoutCadence"], [affiliates, "autoApproveAfterDays"],
      [crm, "customAttributeSchema"],
    ] as const) {
      assert.doesNotMatch(source, new RegExp(field), `${field} must not be promised any more`);
    }
    assert.match(hr, /id: "canStaffEdit"/);
    assert.match(crm, /id: "autoCreateOnSignup"[\s\S]{0,420}?only an existing Contact is linked/);
    assert.match(crm, /id: "defaultTags"[\s\S]{0,420}?Applied to a Contact created without tags of its own/);
    assert.deepEqual(
      UNWIRED_SETTINGS.map(entry => `${entry.pluginId}/${entry.fieldId}`),
      ["agency-hr/canStaffEdit", "public-funnel/redirectAfterCapture", "public-funnel/issueSessionCookie"],
    );
    const adapter = readFileSync("src/built-ins/modules/client-crm/src/server/foundationAdapter.ts", "utf8");
    assert.match(adapter, /settings: readClientCrmSettings\(args\.install\?\.config\)/, "the container must read the install's settings");
  });
});
