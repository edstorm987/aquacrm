# `src/server/company.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (2)

- `getCompanyProfile(agencyId: string, companyId?: string | null): CompanyProfile`
- `updateCompanyProfile(agencyId: string, input: Partial<CompanyProfile>, actorUserId: string, companyId?: string | null): CompanyProfile`

## Depends on (4)

- [`src/lib/performance/hiringCapacity.ts`](../lib/performance/hiringCapacity.md)
- [`src/server/activity.ts`](./activity.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/types.ts`](./types.md)

## Used by (8)

- [`src/app/api/portal/company/route.ts`](../app/api/portal/company/route.md)
- [`src/app/api/portal/search/route.ts`](../app/api/portal/search/route.md)
- [`src/app/portal/agency/page.tsx`](../app/portal/agency/page.md)
- [`src/app/portal/team/_data.ts`](../app/portal/team/_data.md)
- [`src/built-ins/modules/agency-finance/src/pages/PlanningPage.tsx`](../built-ins/modules/agency-finance/src/pages/PlanningPage.md)
- [`src/engines/data/server/kpi/companyHealthSnapshot.ts`](../engines/data/server/kpi/companyHealthSnapshot.md)
- [`src/lib/server/auth/showcaseMode.ts`](../lib/server/auth/showcaseMode.md)
- [`src/lib/server/brandPortfolioService.ts`](../lib/server/brandPortfolioService.md)

