# `src/lib/server/dev/devTeamFindings.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (15)

- `type FindingStatus`
- `type FindingSeverity`
- `FINDING_SEVERITIES: { value: FindingSeverity; label: string; hint: string }[]`
- `interface Finding (10 members)`
- `renderFindingMarkdown(finding: Omit<Finding, "relPath">): string`
- `async createFinding(input: { title: string; note: string; where?: string; severity?: FindingSeverity; images?: string[]; now?: number; }): Promise<Finding>`
- `async listFindings(): Promise<Finding[]>`
- `async getFinding(slug: string): Promise<Finding | null>`
- `async updateFinding(slug: string, patch: { status?: FindingStatus; planRelPath?: string }): Promise<Finding | null>`
- `async readFindingImage(name: string): Promise<Buffer | null>`
- `findingsAsPlanContext(findings: Finding[], maxChars?: number): string`
- `findingsAsPlanNotes(findings: Finding[]): string`
- `defaultPlanTitle(findings: Finding[], now: number = Date.now()): string`
- `interface PlanFromFindings (3 members)`
- `async planFromFindings(findings: Finding[], options: { title?: string; goal?: string; now?: number } = {}): Promise<PlanFromFindings>`

## Depends on (3)

- [`src/lib/server/dev/devDocs.ts`](./devDocs.md)
- [`src/lib/server/dev/devLocalTime.ts`](./devLocalTime.md)
- [`src/lib/server/dev/devTeamPlans.ts`](./devTeamPlans.md)

## Used by (10)

- [`scripts/smoke-dev-console-topbar.test.ts`](../../../../scripts/smoke-dev-console-topbar.test.md)
- [`src/app/api/portal/dev-team/findings/image/route.ts`](../../../app/api/portal/dev-team/findings/image/route.md)
- [`src/app/api/portal/dev-team/findings/route.ts`](../../../app/api/portal/dev-team/findings/route.md)
- [`src/app/portal/agency/_DevTeamStation.tsx`](../../../app/portal/agency/_DevTeamStation.md)
- [`src/app/portal/dev-team/findings/_FindingsWorkspace.tsx`](../../../app/portal/dev-team/findings/_FindingsWorkspace.md)
- [`src/app/portal/dev-team/findings/_Section.tsx`](../../../app/portal/dev-team/findings/_Section.md)
- [`src/app/portal/dev-team/page.tsx`](../../../app/portal/dev-team/page.md)
- [`src/components/chrome/DevConsoleButton.tsx`](../../../components/chrome/DevConsoleButton.md)
- [`src/components/chrome/DevConsolePanel.tsx`](../../../components/chrome/DevConsolePanel.md)
- [`src/lib/server/dev/devConsoleStatus.ts`](./devConsoleStatus.md)

