# Plugin-data erasure — worker handoff

> 🗄 **ARCHIVED 2026-08-20.** Historical worker debrief. The erasure work it describes shipped and its one remaining REWORK (the leads-pipeline `onEraseClient` / email-in-log gap) is now **FIXED** — `leads-pipeline/index.ts:168-180` matches the erasure subject's emails and `contacts.ts:227,252,279` log a contact id, not an email. Superseded by [checklist.md](../../development/checklist.md) and the ground-truth table in [state.md](../state.md). Its only still-live items are Ed's: a staged live erase run and DPO sign-off on the retention schedule (both carried into the launch checklist in [next-wave-briefs.md](../next-wave-briefs.md)).

← [context/](../README.md) · Plan: [plugin-data-erasure.md](../../development/plans/plugin-data-erasure.md) · Status: [status.md](../../development/status.md) · Updates: [updates.md](../../development/updates.md)

_Worker debrief, 2026-08-19. Everything this worker did, tested, tripped over, and thinks — so the next chat (and the auditor) can pick up cold._

---

## TL;DR

The launch-blocker GDPR gap — *"delete a client + all its data" didn't reach plugin-owned data or live Supabase* — is **closed**. `eraseClientCompletely` now sweeps plugin data **and** live tables under a **three-way disposition policy** (delete / retain / plugin-hook), so it erases the identifying PII the subject is entitled to lose **without** destroying the finance/deliverable records held for legal defence (GDPR Art. 17(3)(e)).

- **Code-complete + runtime-verified in memory.** Gating suite green (**1535 pass / 0 fail / 1 skip**), all my files typecheck-clean.
- **The single most important thing that happened:** Ed's disposition policy caught that my first sweep (Phase 2) **over-deleted** finance/orders/deliverables. That was a real, silent, launch-critical bug. It's fixed and can't regress (a per-disposition test pins it).
- **Not done, by design:** a live run against real Supabase, and a DPO sign-off on the retention schedule. Neither is a code gap — see "What's left".

---

## What's done (the phases)

| Phase | What shipped | Verified |
|---|---|---|
| **1** | `onEraseClient?(ctx, clientId)` hook on the plugin manifest (`_types.ts`, additive) | suite green |
| **2** | Runtime sweep of `pluginData`: client-scoped installs slice-dropped; agency-scoped value-scanned; hook seam | 11/11 harness |
| **2b** | `leads-pipeline` `onEraseClient` — erases the `contacts/email/<email>` pointer **key** the value-scan can't reach | 10/10 harness |
| **2.5** | **Disposition policy** — `dataDisposition: "delete" \| "retain"` on the manifest; sweep order **hook › retain › delete**; top-level `RETAIN_COLLECTIONS`. **Stopped the over-deletion.** | 20/20 harness |
| **2.5c** | Strip-PII/keep-payment hooks on `ecommerce` + `affiliates`; confirmed `memberships` needs none | 24/24 harness |
| **3** | Live scrub: `inbox_*` delete + no-PII audit stub; `brand_enquiries` anonymise (resolution split). Injected Supabase client. | 23/23 harness |
| **4** | Audit entry records disposition per area (`deleted:*`/`retained:*`/`anonymised:*`/`hook:*`) + the no-PII live stub | in the tests |
| **5** | Permanent per-disposition regression test in `smoke-client-erasure.test.ts` | 11/11 in-file |

### Files I own / touched
- **Owned:** `server/clientErasure.ts` (the engine), `built-ins/runtime/_types.ts` (additive: `onEraseClient`, `dataDisposition`, `PluginDataDisposition`), `lib/server/pluginStorage.ts` (read only).
- **Caller:** `app/api/portal/clients/[clientId]/erase/route.ts` (added `await`, passes the admin client), `app/portal/clients/[clientId]/settings/page.tsx` (awaits the now-async preview).
- **Out-of-lane, Ed-approved (no other worker owns these):** 7 plugin modules —
  - `leads-pipeline`, `ecommerce`, `affiliates` → `onEraseClient` hook + `onEraseClient?` in each vendored `aquaPluginTypes.ts`.
  - `agency-finance`, `fulfillment`, `memberships` → `dataDisposition: "retain"` + the field in each vendored type.
- **Test:** `scripts/smoke-client-erasure.test.ts` (extended with the fake-Supabase per-disposition suite).

### The erasure map (who gets what)
- **DELETE** (removed outright): comms, marketing PII, contact handles → `client-crm`, `agency-marketing`, generic plugins, most top-level collections.
- **RETAIN** (legal hold, excluded from the sweep): `agency-finance`, `fulfillment`, `memberships`, top-level `clientMilestones`. Kept because you need them to defend a claim / by finance-retention law.
- **HOOK** (retain the record, strip the PII): `ecommerce` (orders keep amounts + Stripe refs, lose customer name/email/address), `affiliates` (rows keep earnings + `stripeAccountId`, lose `displayName`/`payoutEmail`), `leads-pipeline` (deletes contacts incl. the email-in-key).
- Ed's rule applied throughout: **keep all payment/txn refs** (the reconciliation/legal-proof handle), strip only identity PII. The client record itself is **always** deleted, so retained finance keeps only the random `clientId` token, never the person. The member/shopper/affiliate identity records live in the top-level `endCustomers` collection and are deleted centrally.

### Live tables (Phase 3)
- `inbox_conversations` / `inbox_messages` (via `conversation_id`, no direct `client_id`) / `inbox_contact_identities` → **DELETE**, leaving a **no-PII audit stub** (count + date span, never content). `inbox_channel_connections` are agency-level with no client PII → **untouched**.
- `brand_enquiries` → **ANONYMISE**, split by identity resolution: enquirer `resolved` **as** the client → strip PII (`name`/`email`/`phone`/`message` + `replies`/`calls`) + drop link; a **separate party** merely tagged → drop the client link only, keep their record.

---

## What's tested — and how honestly

**Verification level: runtime-verified in memory. NOT run against live Supabase.** (You don't test a destructive op on live records — that's the whole point of the injected client.)

- **4 in-process harnesses** drove the real `eraseClientCompletely` against the memory backend with seeded plugin installs + a **faithful fake Supabase client**: Phase 2 (11), disposition (20), 2.5c hooks (24), Phase 3 live (23). Every one asserts real behaviour, not code shape.
- **Permanent regression test** folded into `smoke-client-erasure.test.ts`: one test seeds a client with retain/delete/hook plugin data + top-level retain + live inbox + two enquiries (resolved vs ambiguous) → erases → asserts **each disposition** held, plus the audit stub. Two more assert the memory-only path (no Supabase → no live scrub) and the route wiring.
- **The fake Supabase client** models supabase-js's chainable+thenable builder for exactly the ops used (`select/delete/update/eq/in`, jsonb `->>`); it's in the test file and reusable.

**What the tests do NOT prove:** that real supabase-js behaves identically to the fake (column names, jsonb filter syntax, the `.delete().in().select()` return shape). That needs the staged live run below.

---

## Challenges (the real ones)

1. **The over-deletion bug — the big one.** My Phase 2 sweep was a blanket "delete everything stamped with the clientId." When Ed handed down the disposition policy, the guard he asked for confirmed it was **destroying finance invoices, ecommerce orders, deliverable proof, payouts and subscriptions** — the exact records you'd need if an erased client later sued. This is the kind of bug that passes every test and is a compliance disaster in production. The fix (disposition policy) is now the spine of the engine. **Lesson for the auditor: scrutinise the RETAIN set — a plugin wrongly classified `delete` is a silent legal-hold breach.**
2. **PII hides in storage *keys*, not just values.** `leads-pipeline` keys an email→id pointer at `contacts/email/<email>`; `memberships` keys subscriptions by user id. A recursive *value* scan can't reach those. That's why some plugins need a bespoke hook and a generic sweep isn't enough. Any **new** agency-scoped plugin that puts an identifier in a key needs its own `onEraseClient`.
3. **"Whose PII is it?"** The trickiest judgment was `brand_enquiries` — public form submissions tagged to a client. The enquirer is usually a *separate party*, so blanket-deleting their submission when you erase the *client* would be wrong. Ed's "split by identity resolution" resolves it: only strip the enquirer's PII when resolution `resolved` them **as** the client; otherwise just drop the routing link.
4. **Testing a destructive live op without touching live.** Solved by injecting the Supabase client (prod passes the real admin client; tests pass a fake). This mirrors the existing `website-enquiries/erase` boundary and keeps the smoke suite safe on the shared live DB.
5. **Multi-entity plugins shrank once I found `endCustomers`.** I feared ecommerce/affiliates/memberships each needed deep multi-entity de-identification. But the member/shopper/affiliate *identity* record is top-level (`endCustomers`) and swept centrally — so the plugins only had to scrub the **denormalised copies** they embed. `memberships` needed no hook at all.

---

## Real thoughts

- **The disposition policy is the actual product here**, not the sweep. "Erase everything" is easy and wrong. The valuable thing is the delete/retain/anonymise classification with a legal rationale — and it now lives declaratively on each plugin manifest (`dataDisposition` / `onEraseClient`), which is the right place: a plugin author declares how their data should be treated on erasure. **This should become a checklist item for every new plugin that stores client data.**
- **This genuinely needs a DPO/solicitor.** I built the *honest structure* of GDPR Art. 17(3)(e) (minimise + retain-for-defence + audit), but which categories, and the time-box on the legal hold, are legal calls. I've been explicit about that everywhere. Don't let "the code is done" read as "we're compliant."
- **The `previewClientErasure` `require()` bug I caught in self-review** is a reminder that RSC + `require` is a trap; the count now excludes retained data so the danger-zone confirmation is honest.
- **I'd trust the memory verification a lot; the live scrub slightly less** — only because the fake, however faithful, isn't supabase-js. One careful staged live run would close that gap fast.

---

## What's left to do (nothing is a code gap)

1. **🔴 Staged live run** (before real clients). Seed a throwaway client with real `inbox_*` + `brand_enquiries` rows on a dev/staging Supabase, run the erase route, confirm: conversations/messages/identities gone, enquiries anonymised with the right split, finance untouched, audit stub written. This validates that real supabase-js matches the fake (column names, jsonb `->>` filter, delete-returns-rows).
2. **🔴 DPO / solicitor sign-off** on the retention schedule: which categories are RETAIN, and how long the legal hold lasts (time-box to the claims-limitation period). Then wire an actual expiry/purge for retained data — currently RETAIN means "kept indefinitely", which is over-retention long-term.
3. **🟡 Browser walk of the danger zone** — I verified the preview *count logic* via the smoke test but didn't click through `/portal/clients/[id]/settings` on a running server (shared `:3032`, same deferral the other workers hit). Low risk; nice to confirm the count renders.
4. **🟡 Future PII-in-key audit** — if any *new* agency-scoped plugin stores an identifier in a storage key, it needs an `onEraseClient` hook. Worth a lint/checklist.
5. **⚪ Unrelated, already flagged:** `fulfillment`'s *module* smoke test (not in the gating suite) fails 11 subtests because its phase presets were rebranded to 7 `aqua-*` stages while the test still expects the old 6 — a separate task exists for the fulfillment owner. **Not caused by this work** (I only added a `dataDisposition` field to that manifest).

---

## For the auditor specifically
- **Scrutinise the RETAIN classification** — a plugin wrongly marked `delete` silently destroys legal-hold data; one wrongly marked `retain` silently keeps PII. Both are the important failure modes here.
- **Check the `brand_enquiries` resolution split** logic against `recordWebsiteEnquiryIdentityResolution` — I relied on `metadata.clientId` and `identityResolution.clientId` being written together (they are, in that one writer).
- **The live scrub is fake-verified only** — flag if you think that's insufficient for a launch blocker (my view: it needs the one staged live run, which is an ops task, not a code fix).
