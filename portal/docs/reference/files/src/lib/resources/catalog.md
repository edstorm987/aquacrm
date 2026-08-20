# `src/lib/resources/catalog.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** T4 unify-fix — Unified resource catalog. Every searchable item on the site lives here, tagged by type. The Resource Finder page filters across all of these in a single input. Adding a new entry is one append; the finder + hub page pick it up automatically.  Type taxonomy (extend as new content lands): tool   — interactive thing the visitor uses (HC, BOS, audits) blog   — long-form writing video  — video / loom / walkthrough faq    — short Q&A entries answering common questions  status: live  — built, link works, visitor can use it now soon  — stub or coming-soon stub at the linked URL

## Exports (6)

- `type ResourceType`
- `type ResourceStatus`
- `interface Resource (8 members)`
- `TYPE_META: Record<ResourceType, { icon: string; label: string; plural: string }>`
- `RESOURCES: readonly Resource[]`
- `searchResources(query: string, typeFilter?: ResourceType | "all"): Resource[]`

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

