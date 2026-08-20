# `src/server/freelancerWorkspace.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (14)

- `DEFAULT_FREELANCER_ACCESS: FreelancerAccessConfig`
- `normaliseFreelancerAccess(input: unknown): FreelancerAccessConfig`
- `getFreelancerAccessConfig(agencyId: string): FreelancerAccessConfig`
- `saveFreelancerAccessConfig(agencyId: string, input: unknown): FreelancerAccessConfig`
- `getFreelancerJobOverride(jobId: string): FreelancerAccessConfig | null`
- `setFreelancerJobOverride(jobId: string, input: unknown): FreelancerAccessConfig`
- `clearFreelancerJobOverride(jobId: string): void`
- `interface FreelancerJobConfigRow (3 members)`
- `listFreelancerJobsForConfig(agencyId: string): FreelancerJobConfigRow[]`
- `resolveFreelancerAccess(agencyId: string, _employeeId: string, jobId?: string): FreelancerAccessConfig`
- `interface FreelancerJobView (11 members)`
- `interface FreelancerWorkspaceView (2 members)`
- `freelancerWorkspace(agencyId: string, userId: string): FreelancerWorkspaceView | null`
- `submitFreelancerJob(agencyId: string, userId: string, jobId: string): { ok: true } | { ok: false; error: "no_freelancer" | "not_your_job" | "not_allowed" | "not_active" }`

## Depends on (4)

- [`src/server/people.ts`](./people.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/tenants.ts`](./tenants.md)
- [`src/server/types.ts`](./types.md)

## Used by (5)

- [`scripts/smoke-dev-mode.test.ts`](../../scripts/smoke-dev-mode.test.md)
- [`src/app/api/portal/freelancer-access/route.ts`](../app/api/portal/freelancer-access/route.md)
- [`src/app/api/portal/freelancer/submit/route.ts`](../app/api/portal/freelancer/submit/route.md)
- [`src/app/portal/agency/freelancer-access/page.tsx`](../app/portal/agency/freelancer-access/page.md)
- [`src/app/portal/freelancer/page.tsx`](../app/portal/freelancer/page.md)

