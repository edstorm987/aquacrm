# Tools — my own palette of saved links

**Horizon:** Shipped locally · **Status:** implemented, focused verification green · **Added:** 2026-08-30 · **Updated:** 2026-09-02
· **Source:** Ed, live

> Ed, verbatim: *"we should actually be able to save links in here and make
> cards. like a painters pallete thing… i might use a specific website for idk
> colour pallete generator i might want to grab the url create a tool save the
> url link name it colour pallete tool and then it makes a card i click the card
> and boom sends me there in a new tab… so we have calender notes chat in tools
> and no more workspace directory since this should all be in operations
> already."*

## ⚠ The premise is wrong for four destinations — read this first

Ed's reason for deleting the Workspace directory is that it duplicates
Operations. **It mostly does, but not entirely.** Measured 2026-08-30:

- Tools lists **21** destinations, Operations lists **10**, and **10 overlap**.
- Of the 11 that are Tools-only, most are reachable from the sidebar anyway
  (Command Centre, Inbox, Settings, Operations itself, Actions, Notepad, and
  Calendar — which gained a second door in the profile menu on 2026-08-30).

**But `scripts/smoke-tools-directory.test.ts:13-15` records that the AquaOasis
agency override deliberately parks three plugin workspaces OUT of the sidebar,
making the Tools directory their _only_ door:**

| Workspace | Route prefix |
| --- | --- |
| People records (agency-hr) | `/portal/agency/agency-hr` |
| Email operations (email-sender) | `/portal/agency/email-sender` |
| Marketing operations (agency-marketing) | `/portal/agency/agency-marketing` |

The same override also drops the **Activity log** (`/portal/agency/activity-inbox`).
Freelancers is safe — Operations carries it under *Money & people*.

**Deleting the directory without rehoming those four orphans them.** They would
still exist, still be routable by hand, and be reachable from nowhere. That is
precisely what `smoke-page-reachability.test.ts` exists to catch, and
`smoke-tools-directory.test.ts` would fail loudly — correctly.

### Do this first, in order

1. Decide where the three parked plugin workspaces belong. Most likely
   Operations, since they are business functions — but note that the override
   parked them deliberately, so find out *why* before undoing it. Check
   `src/lib/chrome/sidebarLayout.ts` and the AquaOasis override.
2. Rehome the Activity log (it may belong with the merged Master Inbox, which is
   also being reworked — see the inbox merge).
3. Only then remove the Workspace directory section from
   `src/app/portal/agency/tools/page.tsx` (currently `:320-345`), and update
   `smoke-tools-directory.test.ts` — which encodes an *earlier* Ed request
   (*"not all directories are listed, we should get them all in"*). That is a
   reversal of a stated decision, so change the test deliberately and record why.

## What Tools becomes

A personal workbench, not a directory:

- **Calendar**, **Notes**, **Chat** — the three built-ins that stay.
- **My tools** — user-created cards, each a saved external link.

### The saved-link card

- Fields: `name`, `url`, optional description (`note` in the backward-compatible
  stored shape), optional built-in icon, optional private uploaded icon, and an
  optional flat folder.
- Click opens in a **new tab** — `target="_blank"` with `rel="noopener noreferrer"`
  (without `noopener`, the opened page gets a handle on the portal tab).
- Grid of tiles matching the existing card styling so it does not read as a
  bolted-on feature.
- Reorderable. The repo already has a drag-to-arrange pattern from the mobile
  topbar work (`dcae0f5`) — reuse it rather than writing a second one.

### Storage — the decision that needs making

Per-user, not per-agency: this is *Ed's* palette, and a freelancer's tools are
not the owner's. Candidate homes:

- the portal user record (like `mfaRecovery`), or
- a keyed plugin-storage document scoped to the user.

Whichever is chosen, it must round-trip through the data-realm rules — a demo
realm must not see live tools.

### Safety — this accepts arbitrary user URLs

- Validate the scheme. **Allow `https:` (and `http:` if you must); reject
  `javascript:`, `data:`, `vbscript:` and `file:`.** An unvalidated `href` from
  a text field is a stored-XSS hole the moment it renders as a link.
- The repo already refuses remote `url()` and `@import` in the CSS-injection
  box (`src/lib/chrome/customCss.ts`) — match that posture and reuse its
  reasoning.
- Cap the number and the field lengths so one paste cannot bloat the state
  document.

### Tests to write

- A scheme validator test with `javascript:` and `data:` payloads.
- A test that saved links render `rel="noopener noreferrer"`.
- A per-user isolation test: user A's tools never appear for user B.

## Implemented 2026-09-02

- The cards now use the same roomy visual structure as the Quick Actions cards:
  a 44px artwork tile, title, multi-line description, folder context and a clear
  Open tool action. Card management controls are always reachable on touch and
  are 44px targets rather than hover-only 28px buttons.
- A person can choose an existing Aqua icon or upload PNG, JPEG or WebP artwork.
  The browser centre-crops it to a 96px WebP before upload. The binary lives in
  private upload storage behind an authenticated self-only content route; the
  always-loaded chrome record stores only a bounded reference, never base64,
  and the authenticated response is explicitly private/no-store. Replacement
  and deletion use a durable cleanup checkpoint, replay after provider refusal
  and the scheduled lifecycle sweep; account erasure fails closed while any
  attached, malformed legacy or pending icon owner still exists. The general
  layout writer preserves server-owned icon metadata and refuses to orphan an
  attached icon by deleting its card directly.
- Up to 24 flat account-scoped folders can be created and renamed. Cards can be
  filed or moved back to Unfiled, filters show live counts, and deleting a folder
  moves its cards to Unfiled without deleting them. Old cards need no migration;
  an absent folder list is empty and an unknown folder id normalises to Unfiled.
- Existing URL allow-listing, 48-card cap, per-user/per-agency storage, read-time
  normalisation, public-showcase exclusion and `noopener noreferrer` links remain.
- Account-layout writes use a monotonic compare-and-set revision. Rapid local
  changes run through one client queue and successful changes notify other open
  tabs. A cross-tab 409 is retried once only when the other tab changed different
  fields; same-collection conflicts and later optimistic writes derived from a
  refused predecessor are reloaded/refused rather than overwriting the winner.
- Focused source/storage/route coverage is in
  `scripts/smoke-my-tools-palette.test.ts`,
  `scripts/smoke-my-tools-icon-route.test.ts` and
  `scripts/smoke-chrome-layout-cas-route.test.ts`; adjacent chrome, private-file
  lifecycle, pinned-tab and topbar-pin suites remain part of the boundary.
