# `src/built-ins/modules/agency-marketing/src/server/templates.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Email-template service. CRUD + idempotent seedDefaults.  Storage: templates/by-id/<id>             → EmailTemplate templates/index                  → string[] of template ids

## Exports (2)

- `DEFAULT_TEMPLATES: readonly Omit<CreateTemplateInput, "bodyText">[]`
- `class TemplateService`
    - `constructor(private agencyId: AgencyId, private storage: StoragePort, private activity: ActivityLogPort, private events: EventBusPort)`
    - `async list(filter?: TemplateFilter): Promise<EmailTemplate[]>`
    - `async listActive(): Promise<EmailTemplate[]>`
    - `async get(id: string): Promise<EmailTemplate | null>`
    - `async create(input: CreateTemplateInput, actor: UserId): Promise<EmailTemplate>`
    - `async update(id: string, patch: UpdateTemplatePatch, actor: UserId): Promise<EmailTemplate | null>`
    - `async seedDefaults(actor: UserId): Promise<{ seeded: number; existed: number }>`
    - `renderHtml(template: EmailTemplate, vars: Record<string, string>): string`
    - `renderSubject(template: EmailTemplate, vars: Record<string, string>): string`

## Depends on (5)

- [`src/built-ins/modules/agency-marketing/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/agency-marketing/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/agency-marketing/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/agency-marketing/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/agency-marketing/src/server/ports.ts`](./ports.md)

## Used by (1)

- [`src/built-ins/modules/agency-marketing/src/server/index.ts`](./index.md)

