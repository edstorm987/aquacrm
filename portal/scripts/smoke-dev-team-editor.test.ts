// The Dev Team Editor — the surface that edits AquaCRM's own configuration.
//
// Before this file, `appConfigAdapter.ts` (446 lines), its write route and its
// client were covered by exactly one assertion in the whole suite: a regex
// looking for the string "EditorSection". Nothing drove the field catalogue,
// the validators, the founder gate on the WRITE, the confirm lock, or the
// normalise↔storage-cleaner alignment. That is how a real defect shipped:
// clearing an optional Identity field did nothing at all while the screen said
// "Applied".
//
// Everything here drives the REAL route handler in-process against
// PORTAL_BACKEND=memory, so each case fails against the behaviour rather than
// the source text.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// First, and statically — see the note in dev-console-request-scope.ts.
import { withDevMode, withRequestScope, withSession } from "./dev-console-request-scope";

process.env.PORTAL_BACKEND ??= "memory";

import { POST } from "../src/app/api/portal/dev-team/editor/route";
import { appConfigEditAdapter } from "../src/lib/server/editing/appConfigAdapter";
import { issueSession } from "../src/lib/server/auth/auth";
import { getAgencyWorkspaceSettings } from "../src/server/agencySettings";
import { ensureHydrated } from "../src/server/storage";
import { createAgency, getAgency, updateAgency } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import type { PublishOutcome } from "../src/engines/editor/editing/engine";

interface EditorBody {
  ok?: boolean;
  error?: string;
  invalid?: { targetId: string; label: string; message: string }[];
  skipped?: { targetId: string; label: string }[];
  outcome?: PublishOutcome;
}

let seq = 0;
async function founder(role: "agency-owner" | "agency-manager" = "agency-owner") {
  await ensureHydrated();
  seq += 1;
  const agency = createAgency({ name: "Editor Co", slug: `editor-co-${Date.now()}-${seq}` });
  const user = createUser({
    email: `${role}-${agency.id}@editor.test`,
    name: "Operator",
    role,
    agencyId: agency.id,
    password: "editor-operator-pass",
  });
  return {
    agency,
    user,
    token: issueSession({
      userId: user.id, email: user.email, role,
      agencyId: agency.id, agencyIds: [agency.id], activeAgencyId: agency.id,
      sessionRev: user.sessionRev ?? 0,
    }),
  };
}

/** The document as the screen would render it: every field with its fingerprint. */
async function currentDocument(agencyId: string, actorUserId: string) {
  const document = await appConfigEditAdapter({ agencyId, actorUserId }).map();
  return new Map(document.targets.map(target => [target.id, target]));
}

async function send(token: string, body: unknown): Promise<{ status: number; body: EditorBody }> {
  const response = await withDevMode(() => withSession(token, () => POST(new Request(
    "http://localhost/api/portal/dev-team/editor",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  ))));
  return { status: response.status, body: await response.json() as EditorBody };
}

/** Everything the editor can touch, with a value that is valid for each. */
const SAMPLE: Record<string, string> = {
  "brand.primaryColor": "#123456",
  "brand.secondaryColor": "#654321",
  "brand.accentColor": "#00FF00",
  "brand.fontHeading": "Inter, ui-sans-serif",
  "brand.fontBody": "Georgia, serif",
  "brand.borderRadius": "14px",
  "brand.logoUrl": "/brand/logo.svg",
  "workspace.legalName": "Editor Co Ltd",
  "workspace.website": "https://editor.example.com/",
  "workspace.supportEmail": "hello@editor.example.com",
  "workspace.phone": "+44 7700 900123",
  "workspace.timezone": "Europe/Paris",
  "workspace.defaultCurrency": "USD",
  "workspace.invoicePrefix": "ED",
  "workspace.clientWelcomeMessage": "Welcome aboard.",
};

/** The five workspace fields and six brand fields that may be emptied. */
const CLEARABLE = [
  "brand.secondaryColor", "brand.accentColor", "brand.fontHeading", "brand.fontBody",
  "brand.borderRadius", "brand.logoUrl",
  "workspace.legalName", "workspace.website", "workspace.supportEmail",
  "workspace.phone", "workspace.clientWelcomeMessage",
];

const REQUIRED = ["brand.primaryColor", "workspace.timezone", "workspace.defaultCurrency", "workspace.invoicePrefix"];

describe("Dev Team Editor — the gate on the WRITE", () => {
  it("a manager gets 404, not 403 — the endpoint does not exist for them", async () => {
    const { token } = await founder("agency-manager");
    const result = await send(token, { confirm: true, intents: [{ targetId: "brand.primaryColor", expectedFingerprint: "x", value: "#000000" }] });
    assert.equal(result.status, 404);
    assert.equal(result.body.ok, false);
  });

  it("outside Dev Mode even the founder gets 404", async () => {
    const { agency, user, token } = await founder();
    const targets = await currentDocument(agency.id, user.id);
    const before = getAgency(agency.id)?.brand?.primaryColor;
    // No withDevMode — PORTAL_DEV_MODE is not set, so devDocsAccessible is false.
    const response = await withSession(token, () => POST(new Request(
      "http://localhost/api/portal/dev-team/editor",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirm: true,
          intents: [{ targetId: "brand.primaryColor", expectedFingerprint: targets.get("brand.primaryColor")!.fingerprint, value: "#ABCDEF" }],
        }),
      },
    )));
    assert.equal(response.status, 404);
    assert.equal(getAgency(agency.id)?.brand?.primaryColor, before, "nothing was written");
  });

  it("an anonymous caller gets 401 and writes nothing", async () => {
    const response = await withDevMode(() => withRequestScope({}, () => POST(new Request(
      "http://localhost/api/portal/dev-team/editor",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ intents: [] }) },
    ))));
    assert.equal(response.status, 401);
  });

  it("more than 64 intents is refused before anything is planned", async () => {
    const { token } = await founder();
    const intents = Array.from({ length: 65 }, () => ({ targetId: "brand.primaryColor", expectedFingerprint: "x", value: "#000000" }));
    const result = await send(token, { confirm: true, intents });
    assert.equal(result.status, 400);
    assert.match(result.body.error ?? "", /between 1 and 64/);
  });

  it("a truthy `confirm` that is not exactly `true` is a dry run", async () => {
    const { agency, user, token } = await founder();
    const targets = await currentDocument(agency.id, user.id);
    for (const confirm of ["true", 1, {}]) {
      const result = await send(token, {
        confirm,
        intents: [{ targetId: "brand.primaryColor", expectedFingerprint: targets.get("brand.primaryColor")!.fingerprint, value: "#ABCDEF" }],
      });
      assert.equal(result.body.outcome?.published, false, `confirm: ${JSON.stringify(confirm)} must not publish`);
    }
    assert.notEqual(getAgency(agency.id)?.brand?.primaryColor, "#ABCDEF", "a truthy string never wrote anything");
  });
});

describe("Dev Team Editor — preview, then apply", () => {
  it("a dry run describes the change and writes nothing", async () => {
    const { agency, user, token } = await founder();
    const targets = await currentDocument(agency.id, user.id);
    const before = getAgency(agency.id)?.brand?.primaryColor ?? "";

    const result = await send(token, {
      intents: [{ targetId: "brand.primaryColor", expectedFingerprint: targets.get("brand.primaryColor")!.fingerprint, value: "#123456" }],
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.outcome?.published, false);
    assert.equal(result.body.outcome?.changes.length, 1);
    assert.equal(result.body.outcome?.changes[0].after, "#123456");
    assert.equal(getAgency(agency.id)?.brand?.primaryColor ?? "", before, "a dry run touches nothing");
  });

  it("applying writes every field group, and the stored value is the previewed one", async () => {
    const { agency, user, token } = await founder();
    const targets = await currentDocument(agency.id, user.id);
    const intents = Object.entries(SAMPLE).map(([targetId, value]) => ({
      targetId, expectedFingerprint: targets.get(targetId)!.fingerprint, value,
    }));

    const preview = await send(token, { intents });
    assert.equal(preview.body.outcome?.rejected.length, 0, "no rejections on a clean batch");
    const previewed = new Map(preview.body.outcome!.changes.map(change => [change.target.id, change.after]));

    const applied = await send(token, { confirm: true, intents });
    assert.equal(applied.body.outcome?.published, true, applied.body.outcome?.summary);

    // The whole point of the preview: what got stored is what was shown.
    const after = await currentDocument(agency.id, user.id);
    for (const [targetId] of Object.entries(SAMPLE)) {
      assert.equal(after.get(targetId)!.value, previewed.get(targetId), `${targetId} stored the previewed value`);
    }
    // …and it really is in the stores, not just the adapter's view.
    assert.equal(getAgency(agency.id)?.brand?.primaryColor, "#123456");
    assert.equal(getAgencyWorkspaceSettings(agency.id).supportEmail, "hello@editor.example.com");
    assert.equal(getAgencyWorkspaceSettings(agency.id).defaultCurrency, "USD");
  });

  it("EVERY optional field can be set AND cleared — the bug that shipped", async () => {
    // `updateAgency` spreads the brand patch, so `undefined` unsets a brand key.
    // `updateAgencyWorkspaceSettings` merges with `patch.X ?? current.X`, where
    // `undefined` means "leave it alone" — so the adapter's `"" → undefined`
    // rule made clearing a legal name, support email, phone, website or welcome
    // message a NO-OP that still reported "Applied". The operator could not
    // remove a stale support email from this screen at all.
    const { agency, user, token } = await founder();

    // Set them all first.
    const setTargets = await currentDocument(agency.id, user.id);
    const setResult = await send(token, {
      confirm: true,
      intents: CLEARABLE.map(targetId => ({
        targetId, expectedFingerprint: setTargets.get(targetId)!.fingerprint, value: SAMPLE[targetId],
      })),
    });
    assert.equal(setResult.body.outcome?.published, true, setResult.body.outcome?.summary);

    const afterSet = await currentDocument(agency.id, user.id);
    for (const targetId of CLEARABLE) {
      assert.notEqual(afterSet.get(targetId)!.value, "", `${targetId} really is set before we try to clear it`);
    }

    // …then clear them all.
    const clearResult = await send(token, {
      confirm: true,
      intents: CLEARABLE.map(targetId => ({
        targetId, expectedFingerprint: afterSet.get(targetId)!.fingerprint, value: "",
      })),
    });
    assert.equal(clearResult.body.outcome?.published, true, clearResult.body.outcome?.summary);

    const afterClear = await currentDocument(agency.id, user.id);
    for (const targetId of CLEARABLE) {
      assert.equal(afterClear.get(targetId)!.value, "", `${targetId} is actually empty afterwards`);
    }
    // The stores agree — not just the adapter's view of them.
    const settings = getAgencyWorkspaceSettings(agency.id);
    assert.equal(settings.supportEmail, undefined);
    assert.equal(settings.legalName, undefined);
    assert.equal(settings.phone, undefined);
    assert.equal(settings.website, undefined);
    assert.equal(settings.clientWelcomeMessage, undefined);
    // And a clear that silently did nothing would have shown up as drift.
    assert.doesNotMatch(clearResult.body.outcome?.summary ?? "", /adjusted on save/);
  });

  it("a required field refuses to be emptied, and nothing else in the batch lands", async () => {
    const { agency, user, token } = await founder();
    const targets = await currentDocument(agency.id, user.id);
    const before = getAgency(agency.id)?.brand?.accentColor ?? "";

    const result = await send(token, {
      confirm: true,
      intents: [
        ...REQUIRED.map(targetId => ({ targetId, expectedFingerprint: targets.get(targetId)!.fingerprint, value: "" })),
        { targetId: "brand.accentColor", expectedFingerprint: targets.get("brand.accentColor")!.fingerprint, value: "#111111" },
      ],
    });
    assert.equal(result.status, 422);
    assert.equal(result.body.invalid?.length, REQUIRED.length, "each required field says so by name");
    assert.equal(getAgency(agency.id)?.brand?.accentColor ?? "", before, "nothing was written");
  });

  it("brand.customCSS and the extended kit survive a brand publish", async () => {
    // `updateAgency` merges `{ ...existing.brand, ...patch.brand }`. Replacing
    // that merge with `patch.brand` is a plausible "simplification" that would
    // wipe every brand key this editor does not offer — including the raw CSS
    // deliberately kept OUT of the editor.
    const { agency, user, token } = await founder();
    updateAgency(agency.id, {
      brand: {
        customCSS: ":root{--x:1}",
        bgElevated: "#fafafa",
        text: "#111111",
        textMuted: "#666666",
        border: "#dddddd",
        radiusSm: "4px",
      },
    });

    const targets = await currentDocument(agency.id, user.id);
    const result = await send(token, {
      confirm: true,
      intents: [{ targetId: "brand.primaryColor", expectedFingerprint: targets.get("brand.primaryColor")!.fingerprint, value: "#2E4053" }],
    });
    assert.equal(result.body.outcome?.published, true, result.body.outcome?.summary);

    const brand = getAgency(agency.id)?.brand as Record<string, unknown>;
    assert.equal(brand.primaryColor, "#2E4053", "the edit landed");
    assert.equal(brand.customCSS, ":root{--x:1}", "…without taking the raw CSS with it");
    assert.equal(brand.bgElevated, "#fafafa");
    assert.equal(brand.textMuted, "#666666");
    assert.equal(brand.radiusSm, "4px");
  });
});

describe("Dev Team Editor — conflicts and no-ops", () => {
  it("a stale fingerprint is refused and the whole batch is held back", async () => {
    const { agency, user, token } = await founder();
    const targets = await currentDocument(agency.id, user.id);
    const staleFingerprint = targets.get("brand.primaryColor")!.fingerprint;

    // Somebody else moves the field underneath the open editor.
    updateAgency(agency.id, { brand: { primaryColor: "#999999" } });
    const accentBefore = getAgency(agency.id)?.brand?.accentColor ?? "";

    const result = await send(token, {
      confirm: true,
      intents: [
        { targetId: "brand.primaryColor", expectedFingerprint: staleFingerprint, value: "#AAAAAA" },
        { targetId: "brand.accentColor", expectedFingerprint: targets.get("brand.accentColor")!.fingerprint, value: "#BBBBBB" },
      ],
    });
    assert.equal(result.body.outcome?.published, false);
    assert.equal(result.body.outcome?.rejected[0]?.reason, "target-changed");
    assert.equal(getAgency(agency.id)?.brand?.primaryColor, "#999999", "their value stands");
    assert.equal(getAgency(agency.id)?.brand?.accentColor ?? "", accentBefore, "all-or-nothing: the other edit did not land either");
  });

  it("an UNRELATED field moving does not block the edit — fingerprints are per field", async () => {
    const { agency, user, token } = await founder();
    const targets = await currentDocument(agency.id, user.id);
    // Somebody edits the support email while this operator is on the colours.
    updateAgency(agency.id, { brand: { secondaryColor: "#010101" } });

    const result = await send(token, {
      confirm: true,
      intents: [{ targetId: "brand.accentColor", expectedFingerprint: targets.get("brand.accentColor")!.fingerprint, value: "#CCCCCC" }],
    });
    assert.equal(result.body.outcome?.published, true, result.body.outcome?.summary);
    assert.equal(getAgency(agency.id)?.brand?.accentColor, "#CCCCCC");
    assert.equal(getAgency(agency.id)?.brand?.secondaryColor, "#010101", "their edit is untouched");
  });

  it("an invisible no-op is SKIPPED, not turned into a rejection that vetoes the batch", async () => {
    // The client marks a field dirty on the RAW string, but trim / lower-case /
    // upper-case / URL normalisation all happen server-side. So a trailing
    // space, or retyping an email with different capitals, used to reach the
    // engine as a real intent, become a `no-change` REJECTION, and take every
    // other valid edit in the batch down with it. The operator was left hunting
    // for whitespace they cannot see.
    const { agency, user, token } = await founder();
    await send(token, {
      confirm: true,
      intents: [
        { targetId: "brand.primaryColor", expectedFingerprint: (await currentDocument(agency.id, user.id)).get("brand.primaryColor")!.fingerprint, value: "#0B6F6D" },
      ],
    });
    const settled = await currentDocument(agency.id, user.id);
    await send(token, {
      confirm: true,
      intents: [{ targetId: "workspace.supportEmail", expectedFingerprint: settled.get("workspace.supportEmail")!.fingerprint, value: "hello@example.com" }],
    });

    const targets = await currentDocument(agency.id, user.id);
    const result = await send(token, {
      confirm: true,
      intents: [
        // Variant 1: a trailing space on a colour.
        { targetId: "brand.primaryColor", expectedFingerprint: targets.get("brand.primaryColor")!.fingerprint, value: "#0B6F6D " },
        // Variant 2: a case-only retype of the same email.
        { targetId: "workspace.supportEmail", expectedFingerprint: targets.get("workspace.supportEmail")!.fingerprint, value: "Hello@Example.com" },
        // …and one real edit that must survive both.
        { targetId: "brand.accentColor", expectedFingerprint: targets.get("brand.accentColor")!.fingerprint, value: "#00FF00" },
      ],
    });

    assert.equal(result.body.outcome?.published, true, result.body.outcome?.summary);
    assert.equal(result.body.outcome?.rejected.length, 0, "a typed space is not a rejection");
    assert.equal(getAgency(agency.id)?.brand?.accentColor, "#00FF00", "the real edit landed");
    assert.equal(getAgency(agency.id)?.brand?.primaryColor, "#0B6F6D", "the no-op left the value alone");
    // Reported, not hidden — the operator typed in those fields.
    assert.deepEqual(
      (result.body.skipped ?? []).map(entry => entry.targetId).sort(),
      ["brand.primaryColor", "workspace.supportEmail"],
    );
  });

  it("a no-op on a field somebody else moved is still a CONFLICT, not a silent skip", async () => {
    const { agency, user, token } = await founder();
    const targets = await currentDocument(agency.id, user.id);
    const stale = targets.get("brand.accentColor")!.fingerprint;
    // Someone else sets it to exactly what this operator is about to type.
    updateAgency(agency.id, { brand: { accentColor: "#ABCABC" } });

    const result = await send(token, {
      confirm: true,
      intents: [{ targetId: "brand.accentColor", expectedFingerprint: stale, value: "#ABCABC" }],
    });
    assert.equal(result.body.outcome?.published, false);
    assert.equal(result.body.outcome?.rejected[0]?.reason, "target-changed", "the conflict contract survives the no-op skip");
    assert.deepEqual(result.body.skipped ?? [], [], "a stale intent is never skipped");
  });
});

describe("Dev Team Editor — validators are the only thing between a paste and a broken stylesheet", () => {
  const BREAKOUTS: [string, string][] = [
    ["brand.fontHeading", "a} body{display:none"],
    ["brand.fontHeading", "Inter;color:red"],
    ["brand.fontBody", "\"Unclosed, serif"],
    ["brand.logoUrl", "javascript:alert(1)"],
    ["brand.logoUrl", "data:text/html;base64,PHNjcmlwdD4="],
    ["brand.primaryColor", "red; }"],
    ["brand.borderRadius", "12px; color:red"],
    ["workspace.supportEmail", "not an email"],
    ["workspace.website", "javascript:alert(1)"],
    ["workspace.legalName", "<script>alert(1)</script>"],
    ["workspace.timezone", "Mars/Olympus"],
    ["workspace.defaultCurrency", "POUNDS"],
    ["workspace.invoicePrefix", "TOO-LONG-PREFIX!"],
  ];

  it("refuses every breakout probe, by name, and writes nothing", async () => {
    const { agency, user, token } = await founder();
    for (const [targetId, value] of BREAKOUTS) {
      const targets = await currentDocument(agency.id, user.id);
      const beforeValue = targets.get(targetId)!.value ?? "";
      const result = await send(token, {
        confirm: true,
        intents: [{ targetId, expectedFingerprint: targets.get(targetId)!.fingerprint, value }],
      });
      assert.equal(result.status, 422, `${targetId} = ${JSON.stringify(value)} is refused`);
      assert.equal(result.body.invalid?.[0]?.targetId, targetId);
      assert.ok((result.body.invalid?.[0]?.message ?? "").length > 0, "…with something the operator can act on");
      const after = await currentDocument(agency.id, user.id);
      assert.equal(after.get(targetId)!.value ?? "", beforeValue, "…and nothing was stored");
    }
  });

  it("an unknown target is refused rather than quietly ignored", async () => {
    const { token } = await founder();
    const result = await send(token, {
      confirm: true,
      intents: [{ targetId: "brand.customCSS", expectedFingerprint: "x", value: "body{}" }],
    });
    assert.equal(result.status, 422);
    assert.match(result.body.invalid?.[0]?.message ?? "", /not an editable setting/);
  });
});
