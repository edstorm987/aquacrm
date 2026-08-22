# Finding — agency-staff can read FINANCE_ADMIN pages, including salaries, by URL

- **Status:** fixed
- **Closed by:** the manifest now gates the pages, not just the tabs — `agency-finance`'s
  `pages[]` declare `visibleToRoles` derived from the same `FINANCE_SECTIONS` list as the
  nav (`financePageRoles()` in `src/lib/sections.ts`), so the host 404s `agency-staff`
  before `OperationsPage` is even imported; `routes.ts` `GET budgets` moved to
  `AGENCY_ADMINS` to agree with `sections.ts`; the same hole was found and closed in
  `agency-hr` (Employees), `affiliates`, `client-crm`, `memberships` (Settings) and
  `fulfillment` (Phases); and `scripts/smoke-finance-section-gates.test.ts` drives the real
  host route as staff **and** carries a generic guard over every registered plugin —
  a page behind a nav entry narrower than its scope's widest must declare roles at least
  as narrow — with a mutation check proving the guard can see a hole.
- **Severity:** high
- **Where:** `/portal/agency/agency-finance/{budgets,operations,planning,settings}`
- **Found:** 22 Aug 2026

## What I saw
A member of staff who is not a finance admin can open the finance admin pages by typing
the URL, and the Operations page hands them compensation data before any client-side
check runs.

**The gate that is missing.** The plugin manifest pages in
`src/built-ins/modules/agency-finance/index.ts` declare no `visibleToRoles`/`roles`, so
`pluginPageAllowedRoles(page)` returns `undefined`, and the host's only remaining gate is
`requireRole(AGENCY_ROLES)` at `src/app/portal/agency/[...rest]/page.tsx:134`. The
navigation hides these tabs via `sections.ts` `FINANCE_ADMIN_ROLES` — but hiding a link
is not access control.

**Why Operations is the worst of the four.** `OperationsPage.tsx` calls
`listCompensationProfiles` and `listPayments` **server-side** and ships the result as
initial props. The admin-only 403 on `/api/portal/agency-finance/operations` therefore
blocks a client-side refresh, not the payload that already rendered. Salaries and bonuses
are in the HTML.

**A second, smaller disagreement.** As staff, `GET budgets` returns **200** — `routes.ts`
declares it `AGENCY_VIEWERS` — while `GET pnl` and `operations/*` correctly return 403.
`routes.ts` and `sections.ts` disagree about who may read budgets. The documented
contract says budgets/operations/planning/settings are FINANCE_ADMIN only; `routes.ts`
is the one that is wrong.

**Verified how:** by driving the real resolver and the real host gate function in-process
(`withSession` + demo-agency identities) over an isolated copy of live state. Not
inferred from reading — executed. All four sections returned
`allowedRoles=undefined — staff passes`.

**This is a class, not an incident.** Any plugin page that relies on nav visibility for
its access control has the same hole. The fix belongs on the manifest so the host gate
enforces it in one place, and it needs a generic test so the class cannot reopen when the
next plugin is written.

**Tests to pin it**
- New `scripts/smoke-finance-section-gates.test.ts`: for every FINANCE_ADMIN section in
  `FINANCE_SECTIONS`, assert `pluginPageAllowedRoles(resolveAgencyPluginPage(...).page)`
  excludes `agency-staff`; drive the dispatcher `GET budgets` as staff expecting 403; and
  assert the Operations SSR payload contains no compensation data for a non-admin.
- A generic guard in the same file: every plugin page whose nav entry is admin-only must
  declare `visibleToRoles`. This is the test that stops the class recurring.

---
_Captured from the Dev Team portal. Findings are the input side: review them, turn them into a plan, hand the plan to a worker._
