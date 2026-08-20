# `src/server/freelancerAdmin.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (5)

- `interface FreelancerAdminRow (6 members)`
- `listAgencyFreelancers(agencyId: string): FreelancerAdminRow[]`
- `interface CreateFreelancerResult (4 members)`
- `createFreelancer(agencyId: string, actorUserId: string, input: { name?: string; email?: string; title?: string }): CreateFreelancerResult`
- `freelancerLoginUserId(agencyId: string, employeeId: string): string | null`

## Depends on (3)

- [`src/server/people.ts`](./people.md)
- [`src/server/types.ts`](./types.md)
- [`src/server/users.ts`](./users.md)

## Used by (5)

- [`scripts/smoke-dev-mode-identity.test.ts`](../../scripts/smoke-dev-mode-identity.test.md)
- [`scripts/smoke-dev-mode.test.ts`](../../scripts/smoke-dev-mode.test.md)
- [`src/app/api/auth/preview-as-freelancer/route.ts`](../app/api/auth/preview-as-freelancer/route.md)
- [`src/app/api/portal/freelancers/route.ts`](../app/api/portal/freelancers/route.md)
- [`src/app/portal/agency/freelancers/page.tsx`](../app/portal/agency/freelancers/page.md)

