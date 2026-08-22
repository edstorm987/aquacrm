# `src/server/users.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (19)

- `hashPassword(password: string): string`
- `interface PasswordValidationResult (2 members)`
- `validatePassword(password: string): PasswordValidationResult`
- `interface UserLookupScope (2 members)`
- `interface CreateUserInput (8 members)`
- `createUser(input: CreateUserInput): ServerUser`
- `getUser(email: string, scope?: UserLookupScope): ServerUser | null`
- `getUserByLogin(login: string, scope?: UserLookupScope): ServerUser | null`
- `getUserById(userId: string): ServerUser | null`
- `verifyPassword(email: string, password: string, scope?: UserLookupScope): ServerUser | null`
- `verifyLoginPassword(login: string, password: string, scope?: UserLookupScope): ServerUser | null`
- `listUsersForAgency(agencyId: string): ServerUser[]`
- `listUsersForClient(clientId: string): ServerUser[]`
- `setUserPassword(email: string, password: string, scope?: UserLookupScope): boolean`
- `interface UpdateUserPatch (9 members)`
- `updateUser(email: string, patch: UpdateUserPatch, scope?: UserLookupScope): ServerUser | null`
- `markWelcomeComplete(userId: string): ServerUser | null`
- `markEmailVerified(userId: string): ServerUser | null`
- `rotateUserSession(userId: string): ServerUser | null`

## Depends on (3)

- [`src/server/eventBus.ts`](./eventBus.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/types.ts`](./types.md)

## Used by (97)

- [`scripts/smoke-app-route-tenancy.test.ts`](../../scripts/smoke-app-route-tenancy.test.md)
- [`scripts/smoke-aqua-editor-ai-history.test.ts`](../../scripts/smoke-aqua-editor-ai-history.test.md)
- [`scripts/smoke-aqua-editor-ai-reply.test.ts`](../../scripts/smoke-aqua-editor-ai-reply.test.md)
- [`scripts/smoke-aqua-editor-ai-token.test.ts`](../../scripts/smoke-aqua-editor-ai-token.test.md)
- [`scripts/smoke-auth-form-encoding.test.ts`](../../scripts/smoke-auth-form-encoding.test.md)
- [`scripts/smoke-company-portal.test.ts`](../../scripts/smoke-company-portal.test.md)
- [`scripts/smoke-company-switcher.test.ts`](../../scripts/smoke-company-switcher.test.md)
- [`scripts/smoke-dev-editor-aqua-tag.test.ts`](../../scripts/smoke-dev-editor-aqua-tag.test.md)
- [`scripts/smoke-dev-mode-identity.test.ts`](../../scripts/smoke-dev-mode-identity.test.md)
- [`scripts/smoke-dev-mode.test.ts`](../../scripts/smoke-dev-mode.test.md)
- [`scripts/smoke-dev-project-map.test.ts`](../../scripts/smoke-dev-project-map.test.md)
- [`scripts/smoke-dev-project-nesting.test.ts`](../../scripts/smoke-dev-project-nesting.test.md)
- [`scripts/smoke-dev-team-api-view.test.ts`](../../scripts/smoke-dev-team-api-view.test.md)
- [`scripts/smoke-dev-team-editor.test.ts`](../../scripts/smoke-dev-team-editor.test.md)
- [`scripts/smoke-dev-team-gates.test.ts`](../../scripts/smoke-dev-team-gates.test.md)
- [`scripts/smoke-editor-surface-modes.test.ts`](../../scripts/smoke-editor-surface-modes.test.md)
- [`scripts/smoke-editor-words-publish.test.ts`](../../scripts/smoke-editor-words-publish.test.md)
- [`scripts/smoke-element-insert.test.ts`](../../scripts/smoke-element-insert.test.md)
- [`scripts/smoke-finance-section-gates.test.ts`](../../scripts/smoke-finance-section-gates.test.md)
- [`scripts/smoke-librarian.test.ts`](../../scripts/smoke-librarian.test.md)
- [`scripts/smoke-mfa-doors.test.ts`](../../scripts/smoke-mfa-doors.test.md)
- [`scripts/smoke-mfa.test.ts`](../../scripts/smoke-mfa.test.md)
- [`scripts/smoke-plugin-api-host-gates.test.ts`](../../scripts/smoke-plugin-api-host-gates.test.md)
- [`scripts/smoke-plugin-api-tenancy.test.ts`](../../scripts/smoke-plugin-api-tenancy.test.md)
- [`scripts/smoke-plugin-page-host-gates.test.ts`](../../scripts/smoke-plugin-page-host-gates.test.md)
- [`scripts/smoke-repo-write.test.ts`](../../scripts/smoke-repo-write.test.md)
- [`scripts/smoke-website-signup-lead.test.ts`](../../scripts/smoke-website-signup-lead.test.md)
- [`scripts/smoke-work-lifecycle.test.ts`](../../scripts/smoke-work-lifecycle.test.md)
- [`src/app/api/assistant/route.ts`](../app/api/assistant/route.md)
- [`src/app/api/auth/dev-mode/route.ts`](../app/api/auth/dev-mode/route.md)
- [`src/app/api/auth/end-customer/signup/route.ts`](../app/api/auth/end-customer/signup/route.md)
- [`src/app/api/auth/login/route.ts`](../app/api/auth/login/route.md)
- [`src/app/api/auth/magic/verify/route.ts`](../app/api/auth/magic/verify/route.md)
- [`src/app/api/auth/oauth/google/callback/route.ts`](../app/api/auth/oauth/google/callback/route.md)
- [`src/app/api/auth/password/request-reset/route.ts`](../app/api/auth/password/request-reset/route.md)
- [`src/app/api/auth/password/reset/route.ts`](../app/api/auth/password/reset/route.md)
- [`src/app/api/auth/preview-as-client-at-phase/route.ts`](../app/api/auth/preview-as-client-at-phase/route.md)
- [`src/app/api/auth/preview-as-freelancer/route.ts`](../app/api/auth/preview-as-freelancer/route.md)
- [`src/app/api/auth/profile/avatar/route.ts`](../app/api/auth/profile/avatar/route.md)
- [`src/app/api/auth/profile/update/route.ts`](../app/api/auth/profile/update/route.md)
- [`src/app/api/auth/showcase-mode/route.ts`](../app/api/auth/showcase-mode/route.md)
- [`src/app/api/auth/signup/route.ts`](../app/api/auth/signup/route.md)
- [`src/app/api/auth/switch-agency/route.ts`](../app/api/auth/switch-agency/route.md)
- [`src/app/api/auth/verify-email/route.ts`](../app/api/auth/verify-email/route.md)
- [`src/app/api/portal/agency/companies/[companyId]/portal/route.ts`](../app/api/portal/agency/companies/[companyId]/portal/route.md)
- [`src/app/api/portal/agency/users/route.ts`](../app/api/portal/agency/users/route.md)
- [`src/app/api/portal/customer/setup/route.ts`](../app/api/portal/customer/setup/route.md)
- [`src/app/api/portal/customer/workspace/route.ts`](../app/api/portal/customer/workspace/route.md)
- [`src/app/api/portal/dev-team/docs/route.ts`](../app/api/portal/dev-team/docs/route.md)
- [`src/app/api/portal/dev-team/thoughts/route.ts`](../app/api/portal/dev-team/thoughts/route.md)
- [`src/app/api/portal/dev/lifecycle/route.ts`](../app/api/portal/dev/lifecycle/route.md)
- [`src/app/api/portal/people/route.ts`](../app/api/portal/people/route.md)
- [`src/app/api/portal/search/route.ts`](../app/api/portal/search/route.md)
- [`src/app/api/public/brand-enquiry/route.ts`](../app/api/public/brand-enquiry/route.md)
- [`src/app/api/public/contact/route.ts`](../app/api/public/contact/route.md)
- [`src/app/api/tenants/client-operations/route.ts`](../app/api/tenants/client-operations/route.md)
- [`src/app/api/tenants/seed/route.ts`](../app/api/tenants/seed/route.md)
- [`src/app/api/v1/embed/consume/route.ts`](../app/api/v1/embed/consume/route.md)
- [`src/app/client-preview/[clientId]/page.tsx`](../app/client-preview/[clientId]/page.md)
- [`src/app/dev/route.ts`](../app/dev/route.md)
- [`src/app/portal/account/page.tsx`](../app/portal/account/page.md)
- [`src/app/portal/agency/actions/_ActionsPage.tsx`](../app/portal/agency/actions/_ActionsPage.md)
- [`src/app/portal/agency/assistant/page.tsx`](../app/portal/agency/assistant/page.md)
- [`src/app/portal/agency/automations/_automationWorkspaceData.ts`](../app/portal/agency/automations/_automationWorkspaceData.md)
- [`src/app/portal/agency/company/page.tsx`](../app/portal/agency/company/page.md)
- [`src/app/portal/agency/layout.tsx`](../app/portal/agency/layout.md)
- [`src/app/portal/agency/page.tsx`](../app/portal/agency/page.md)
- [`src/app/portal/agency/settings/page.tsx`](../app/portal/agency/settings/page.md)
- [`src/app/portal/agency/you-deserve-it/page.tsx`](../app/portal/agency/you-deserve-it/page.md)
- [`src/app/portal/clients/[clientId]/layout.tsx`](../app/portal/clients/[clientId]/layout.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../app/portal/clients/[clientId]/page.md)
- [`src/app/portal/clients/page.tsx`](../app/portal/clients/page.md)
- [`src/app/portal/customer/account/page.tsx`](../app/portal/customer/account/page.md)
- [`src/app/portal/customer/layout.tsx`](../app/portal/customer/layout.md)
- [`src/app/portal/dev-team/layout.tsx`](../app/portal/dev-team/layout.md)
- [`src/app/portal/freelancer/layout.tsx`](../app/portal/freelancer/layout.md)
- [`src/app/portal/layout.tsx`](../app/portal/layout.md)
- [`src/app/portal/team/layout.tsx`](../app/portal/team/layout.md)
- [`src/app/setup/page.tsx`](../app/setup/page.md)
- [`src/app/showcase/route.ts`](../app/showcase/route.md)
- [`src/archive/multi-agency/api/agency-add.ts`](../archive/multi-agency/api/agency-add.md)
- [`src/archive/multi-agency/api/agency-switch.ts`](../archive/multi-agency/api/agency-switch.md)
- [`src/built-ins/runtime/foundation-adapters/_foundationPorts.ts`](../built-ins/runtime/foundation-adapters/_foundationPorts.md)
- [`src/built-ins/runtime/foundation-adapters/leadFunnelPorts.ts`](../built-ins/runtime/foundation-adapters/leadFunnelPorts.md)
- [`src/engines/data/server/radar/businessIssueRadar.ts`](../engines/data/server/radar/businessIssueRadar.md)
- [`src/engines/data/server/radar/radarSourceInspection.ts`](../engines/data/server/radar/radarSourceInspection.md)
- [`src/engines/editor/server/editorAssistant.ts`](../engines/editor/server/editorAssistant.md)
- [`src/lib/server/auth/auth.ts`](../lib/server/auth/auth.md)
- [`src/lib/server/brandPortfolioService.ts`](../lib/server/brandPortfolioService.md)
- [`src/lib/server/inbox/operationalAlerts.ts`](../lib/server/inbox/operationalAlerts.md)
- [`src/lib/server/resolutionPlans.ts`](../lib/server/resolutionPlans.md)
- [`src/lib/server/seeds/demoSeed.ts`](../lib/server/seeds/demoSeed.md)
- [`src/lib/server/seeds/founderSeed.ts`](../lib/server/seeds/founderSeed.md)
- [`src/server/automations.ts`](./automations.md)
- [`src/server/freelancerAdmin.ts`](./freelancerAdmin.md)
- [`src/server/people.ts`](./people.md)
- [`src/server/portalConnectionStore.ts`](./portalConnectionStore.md)

