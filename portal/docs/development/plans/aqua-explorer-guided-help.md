# Aqua Explorer — guided help, as a skill and as a screen

**Horizon:** Someday · **Status:** idea, deliberately not started · **Added:** 2026-08-29
· **Source:** Ed, live

> ⚠ **NAME COLLISION — read before writing any code.**
> `AquaExplorer*` is already taken. `src/lib/integrations/aquaExplorerBridge.ts`
> is a re-export alias of the Aqua **Tag** bridge, kept so the Project Explorer
> and its tests keep working (see
> [hazards-and-duplication.md](../../workspace/hazards-and-duplication.md)).
> That is a completely different thing from the idea below. Either pick a
> different product name, or rename the bridge first — do not let two unrelated
> "Explorer"s exist, which is exactly the duplication that chapter exists to
> prevent.

## The idea, in Ed's words

> *"Aqua Explorer we could build as a skill for the assistant actually, and it
> could just be like a help — think like a tutorial almost, just ask a question
> or something. But maybe we have it in settings, a UI version, just like
> everything-tutorial perhaps as well."*

Two faces on one body of knowledge:

- **Ask it.** A skill the Aqua Advisor can use, so "where do I set the Stripe
  keys" or "how do I import a call list" is answered in the assistant, in place,
  without leaving what you were doing.
- **Browse it.** A screen in Settings that is the same material laid out as a
  tutorial — the everything-guide, for when you do not yet know the question.

The second is what makes the first work. A person who does not know a feature
exists cannot ask about it, and that is the actual failure mode this product
has: measured 2026-08-29, ~169 destinations, ~60 of them tab-views buried inside
pages, against 55 navigation entries.

## Why it is NOT being built yet

Ed's reasoning, and it is the right call:

> *"I think this will be very useful once we've finalised everything — as if we
> built it now and I change things, we have to pointlessly change this idea to
> adapt with it."*

A guide is a **mirror of the product's shape**. Every rename, merge or moved tab
is a second edit in the guide, and a guide that lags is worse than none — it
sends people confidently to the wrong place. Until the information architecture
settles, the maintenance cost is paid on every change for a benefit that only
arrives at the end.

**The signal that it is time:** the navigation stops moving. Concretely — no
panel merges or tab consolidations for a few weeks, and
`smoke-page-reachability` / `smoke-portal-destinations` stop needing edits.

## What it should be built ON, when the time comes

Do not hand-write the content. Almost all of it already exists and is already
kept honest by tests — a hand-written guide would be a fourth copy that drifts:

| Source | What it already knows |
|---|---|
| `src/lib/chrome/destinations.ts` | every page, its label and its area; a test walks the route tree so it cannot go stale |
| `docs/workspace/feature-index.md` | feature → files, i.e. "does this already exist" |
| `docs/workspace/*.md` | per-area chapters written for humans |
| `ACCESS_ELEMENT_KEYS` + `ELEMENT_CAPABILITIES` | what each area IS, in the app's own vocabulary, with descriptions |
| `DEPARTMENT_PROFILES` | which job needs which surfaces |

The last two matter most: the guide should show a person what **their role can
actually reach**, not the whole product. A tutorial that explains features
somebody's seat forbids is a tour of a locked building.

## Open questions to settle at build time — not now

- One body of content rendered two ways, or a skill that reads the Settings
  screen's own data? (Prefer the former; two renderers of one source.)
- Does it explain **tab-views**, not just pages? That is where the burial
  actually is, so probably yes — which means the destination registry needs to
  reach one level deeper first.
- Is it per-role from day one, or global with a "you cannot reach this" note?

## Related

- [information-architecture-v2.md](information-architecture-v2.md) — the IA this
  guide would describe; it must stop moving first.
- `scripts/smoke-portal-destinations.test.ts` — the mechanism that keeps a
  generated guide honest.
