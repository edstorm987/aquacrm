# `src/server/people.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (77)

- `PEOPLE_STATIONS: ReadonlyArray<{ id: PeopleWorkspaceStationId; label: string; description: string; href: string; mandatory?: boolean; }>`
- `DEFAULT_PEOPLE_ACCESS: PeopleWorkspaceAccess[]`
- `hashPeopleStatusToken(token: string): string`
- `defaultOnboardingSteps(): PeopleOnboardingStep[]`
- `getPeopleProcessConfig(agencyId: string): PeopleProcessConfig`
- `savePeopleOnboardingTemplate(agencyId: string, steps: Array<{ id?: string; label: string; owner?: "company" | "employee"; detail?: string; requiresEvidence?: boolean }>, actorUserId: string): PeopleProcessConfig`
- `savePeopleHiringStages(agencyId: string, stages: Array<{ id: string; label?: string; guidance?: string }>, actorUserId: string): PeopleProcessConfig`
- `listPeopleApplications(agencyId: string): PeopleApplication[]`
- `getPeopleApplication(agencyId: string, applicationId: string): PeopleApplication | null`
- `getPeopleApplicationByToken(token: string): PeopleApplication | null`
- `createPeopleApplication(input: { agencyId: string; name: string; email: string; phone?: string; roleInterest: string; employmentPreference?: PeopleEmploymentType; location?: string; portfolioUrl?: string; linkedInUrl?: string; coverNote?: …`
- `updatePeopleApplication(input: { agencyId: string; applicationId: string; actorUserId: string; stage?: PeopleApplicationStage; note?: string; }): PeopleApplication | null`
- `rotatePeopleApplicationStatusToken(agencyId: string, applicationId: string): string | null`
- `listPeopleEmployees(agencyId: string): PeopleEmployee[]`
- `getPeopleEmployee(agencyId: string, employeeId: string): PeopleEmployee | null`
- `getPeopleEmployeeByUserId(agencyId: string, userId: string): PeopleEmployee | null`
- `peopleStationAccess(agencyId: string, userId: string, stationId: PeopleWorkspaceStationId): PeopleWorkspaceAccess | null`
- `canUsePeopleStation(agencyId: string, userId: string, stationId: PeopleWorkspaceStationId, write = false): boolean`
- `createPeopleEmployee(input: { agencyId: string; actorUserId: string; applicationId?: string; userId?: string; name: string; email: string; phone?: string; title: string; department?: string; employmentType?: PeopleEmploymentType; startDate…`
- `updatePeopleEmployee(agencyId: string, employeeId: string, patch: Partial<Omit<PeopleEmployee, "id" | "agencyId" | "createdAt" | "updatedAt" | "applicationId" | "userId">> & { userId?: string }, actorUserId: string): PeopleEmployee | null`
- `normalizePeopleAccess(value: PeopleWorkspaceAccess[]): PeopleWorkspaceAccess[]`
- `listPeopleLeaveRequests(agencyId: string, employeeId?: string): PeopleLeaveRequest[]`
- `createPeopleLeaveRequest(input: { agencyId: string; employeeId: string; type: PeopleLeaveRequest["type"]; startsOn: string; endsOn: string; note?: string; }): PeopleLeaveRequest`
- `decidePeopleLeaveRequest(input: { agencyId: string; requestId: string; status: "approved" | "rejected" | "cancelled"; actorUserId: string; note?: string; }): PeopleLeaveRequest | null`
- `listPeopleShifts(agencyId: string, employeeId?: string): PeopleShift[]`
- `savePeopleShift(input: Omit<PeopleShift, "id" | "createdAt" | "updatedAt"> & { id?: string }): PeopleShift`
- `listPeopleTraining(agencyId: string, employeeId?: string): PeopleTrainingAssignment[]`
- `savePeopleTraining(input: Omit<PeopleTrainingAssignment, "id" | "createdAt" | "updatedAt"> & { id?: string }): PeopleTrainingAssignment`
- `listPeopleTrainingModules(agencyId: string, publishedOnly = false): PeopleTrainingModule[]`
- `getPeopleTrainingModule(agencyId: string, moduleId: string): PeopleTrainingModule | null`
- `savePeopleTrainingModule(input: { agencyId: string; actorUserId: string; id?: string; title: string; summary?: string; blocks?: PeopleTrainingBlock[]; quiz?: PeopleTrainingQuizQuestion[]; passMark?: number; status?: "draft" | "published"; …`
- `interface TrainingQuizResult (4 members)`
- `gradeTrainingQuiz(module: PeopleTrainingModule, answers: Record<string, string>): TrainingQuizResult`
- `completeModuleAssignment(input: { agencyId: string; assignmentId: string; userId: string; answers: Record<string, string> }): { assignment: PeopleTrainingAssignment; result: TrainingQuizResult } | null`
- `listPeopleFreelancerJobs(agencyId: string, employeeId?: string): PeopleFreelancerJob[]`
- `savePeopleFreelancerJob(input: { agencyId: string; actorUserId: string; id?: string; employeeId: string; title: string; brief?: string; clientId?: string; feeMinor?: number; currency?: string; startsOn?: string; dueOn?: string; notes?: str…`
- `setPeopleFreelancerJobStatus(input: { agencyId: string; jobId: string; status: PeopleFreelancerJobStatus; actorUserId: string; paymentRef?: string; }): PeopleFreelancerJob | null`
- `listPeopleRecognitions(agencyId: string, employeeId?: string): PeopleRecognition[]`
- `currentEmployeeOfMonth(agencyId: string): PeopleRecognition | null`
- `awardPeopleRecognition(input: { agencyId: string; actorUserId: string; employeeId: string; kind: PeopleRecognitionKind; period?: string; note?: string; }): PeopleRecognition`
- `listPeopleFeedback(agencyId: string, employeeId?: string): PeopleFeedback[]`
- `createPeopleFeedback(input: { agencyId: string; employeeId: string; message: string; sentiment?: PeopleFeedbackSentiment; }): PeopleFeedback`
- `setPeopleFeedbackStatus(agencyId: string, feedbackId: string, status: PeopleFeedback["status"]): PeopleFeedback | null`
- `listPeopleContracts(agencyId: string, employeeId?: string): PeopleContract[]`
- `createPeopleContract(input: { agencyId: string; actorUserId: string; employeeId: string; kind?: PeopleContractKind; title?: string; summary?: string; body?: string; templateId?: string; }): PeopleContract`
- `sendPeopleContract(agencyId: string, contractId: string, actorUserId: string): PeopleContract | null`
- `acknowledgePeopleContract(input: { agencyId: string; contractId: string; userId: string; name: string; decline?: boolean }): PeopleContract | null`
- `ensureTeamChannel(agencyId: string): PeopleChannel`
- `listPeopleChannels(agencyId: string, userId: string): PeopleChannel[]`
- `ensureDirectChannel(agencyId: string, userIdA: string, userIdB: string): PeopleChannel`
- `listPeopleMessages(agencyId: string, channelId: string, limit = 100): PeopleMessage[]`
- `postPeopleMessage(input: { agencyId: string; channelId: string; authorUserId: string; body: string }): PeopleMessage`
- `markChannelRead(agencyId: string, channelId: string, userId: string, now = Date.now()): void`
- `interface ChatAttention (4 members)`
- `chatAttentionForUser(agencyId: string, userId: string): ChatAttention`
- `ownerChatAttention(agencyId: string): (ChatAttention & { ownerUserId: string }) | null`
- `workingTodayUserIds(agencyId: string, now = Date.now()): string[]`
- `interface TeamChatRosterEntry (4 members)`
- `teamChatSnapshot(agencyId: string, userId: string, activeChannelId?: string, now = Date.now())`
- `type StaffPresenceState`
- `interface StaffPresence (4 members)`
- `PRESENCE_ONLINE_MS`
- `PRESENCE_IDLE_MS`
- `interface StaffWorkSummary (6 members)`
- `interface StaffDirectoryEntry (15 members)`
- `interface StaffCard (13 members)`
- `interface DelegatableTask (5 members)`
- `staffDirectory(agencyId: string, now = Date.now()): StaffDirectoryEntry[]`
- `staffCard(agencyId: string, entryId: string, now = Date.now()): StaffCard | null`
- `interface StaffOrgNode (2 members)`
- `interface StaffDepartmentComposition (4 members)`
- `interface StaffOrgChart (5 members)`
- `staffOrgChart(agencyId: string, now = Date.now()): StaffOrgChart`
- `delegatableTasks(agencyId: string): DelegatableTask[]`
- `peopleSnapshot(agencyId: string, now = Date.now())`
- `sanitizeModuleForStaff(module: PeopleTrainingModule)`
- `employeePeopleSnapshot(agencyId: string, userId: string)`

## Depends on (6)

- [`src/server/activity.ts`](./activity.md)
- [`src/server/contractTemplates.ts`](./contractTemplates.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/tasks.ts`](./tasks.md)
- [`src/server/types.ts`](./types.md)
- [`src/server/users.ts`](./users.md)

## Used by (24)

- [`scripts/smoke-dev-mode.test.ts`](../../scripts/smoke-dev-mode.test.md)
- [`src/app/api/portal/dashboard-planning/route.ts`](../app/api/portal/dashboard-planning/route.md)
- [`src/app/api/portal/notepad/route.ts`](../app/api/portal/notepad/route.md)
- [`src/app/api/portal/people/cv/route.ts`](../app/api/portal/people/cv/route.md)
- [`src/app/api/portal/people/route.ts`](../app/api/portal/people/route.md)
- [`src/app/api/portal/search/route.ts`](../app/api/portal/search/route.md)
- [`src/app/api/portal/tasks/route.ts`](../app/api/portal/tasks/route.md)
- [`src/app/api/portal/team-chat/route.ts`](../app/api/portal/team-chat/route.md)
- [`src/app/api/public/careers/route.ts`](../app/api/public/careers/route.md)
- [`src/app/api/tenants/client-operation-task/route.ts`](../app/api/tenants/client-operation-task/route.md)
- [`src/app/api/tenants/client-operations/route.ts`](../app/api/tenants/client-operations/route.md)
- [`src/app/careers/status/[token]/page.tsx`](../app/careers/status/[token]/page.md)
- [`src/app/portal/agency/page.tsx`](../app/portal/agency/page.md)
- [`src/app/portal/agency/people/_PeopleCommand.tsx`](../app/portal/agency/people/_PeopleCommand.md)
- [`src/app/portal/agency/people/page.tsx`](../app/portal/agency/people/page.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../app/portal/clients/[clientId]/page.md)
- [`src/app/portal/team/[section]/page.tsx`](../app/portal/team/[section]/page.md)
- [`src/app/portal/team/_data.ts`](../app/portal/team/_data.md)
- [`src/app/portal/team/layout.tsx`](../app/portal/team/layout.md)
- [`src/lib/server/finance/financeWorkforce.ts`](../lib/server/finance/financeWorkforce.md)
- [`src/lib/server/inbox/operationalAlerts.ts`](../lib/server/inbox/operationalAlerts.md)
- [`src/lib/server/seeds/demoSeed.ts`](../lib/server/seeds/demoSeed.md)
- [`src/server/freelancerAdmin.ts`](./freelancerAdmin.md)
- [`src/server/freelancerWorkspace.ts`](./freelancerWorkspace.md)

