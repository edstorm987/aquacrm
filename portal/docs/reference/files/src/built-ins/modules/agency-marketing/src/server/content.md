# `src/built-ins/modules/agency-marketing/src/server/content.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** ContentCalendarService — content items + week/month grid. R008 addition.  Storage layout: content/index           → string[] of item ids content/by-id/<id>      → ContentItem content/by-campaign/<c> → string[] of item ids

## Exports (1)

- `class ContentCalendarService`
    - `constructor(private agencyId: AgencyId, private storage: StoragePort, private activity: ActivityLogPort, private events: EventBusPort)`
    - `async list(filter: ContentItemFilter = {}): Promise<ContentItem[]>`
    - `async get(id: string): Promise<ContentItem | null>`
    - `async create(actor: UserId, input: CreateContentItemInput): Promise<ContentItem>`
    - `async update(actor: UserId, id: string, patch: UpdateContentItemPatch): Promise<ContentItem>`
    - `async publish(actor: UserId, id: string): Promise<ContentItem>`
    - `async archive(actor: UserId, id: string): Promise<void>`
    - `async window(windowStart: number, windowEnd: number): Promise<CalendarWindow>`

## Depends on (5)

- [`src/built-ins/modules/agency-marketing/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/agency-marketing/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/agency-marketing/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/agency-marketing/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/agency-marketing/src/server/ports.ts`](./ports.md)

## Used by (2)

- [`src/built-ins/modules/agency-marketing/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/agency-marketing/src/server/touchpoints.ts`](./touchpoints.md)

