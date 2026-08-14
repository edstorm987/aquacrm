import assert from "node:assert/strict";
import test from "node:test";

import { resolveAttentionThreadKey, type AttentionThreadCandidate } from "../src/lib/inbox/attentionThread";
import type { OperationalAlert } from "../src/lib/operationalAttention";

const candidates: AttentionThreadCandidate[] = [
  { key: "website:form_1", formId: "form_1", name: "Alex Stone", email: "alex@example.com" },
  { key: "client:req_1", requestId: "req_1", clientId: "cli_1", name: "North Studio" },
  { key: "profile:cli_1", clientId: "cli_1", name: "North Studio", email: "owner@north.test" },
];

function alert(patch: Partial<OperationalAlert>): OperationalAlert {
  return { id: "alert_1", severity: "warning", category: "client", title: "Needs attention", detail: "Review this relationship.", href: "/portal/agency/inbox", occurredAt: Date.now(), ...patch };
}

test("resolves an enquiry alert to its exact unified inbox thread", () => {
  assert.equal(resolveAttentionThreadKey(alert({ href: "/portal/agency/inbox?view=forms&form=form_1" }), candidates), "website:form_1");
});

test("prefers the active client conversation over the profile shell", () => {
  assert.equal(resolveAttentionThreadKey(alert({ href: "/portal/clients/cli_1", clientName: "North Studio" }), candidates), "client:req_1");
});

test("falls back to a named contact profile when no thread id is present", () => {
  assert.equal(resolveAttentionThreadKey(alert({ title: "Check in with Alex Stone" }), candidates), "website:form_1");
});
