# `src/built-ins/modules/website-editor/src/lib/customise.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (18)

- `type AdminMode`
- `interface AdminBranding (10 members)`
- `DEFAULT_BRANDING: AdminBranding`
- `getBranding(): AdminBranding`
- `saveBranding(patch: Partial<AdminBranding>): void`
- `resetBranding(): void`
- `interface CustomTab (9 members)`
- `listCustomTabs(): CustomTab[]`
- `getCustomTab(id: string): CustomTab | null`
- `createCustomTab(input: Omit<CustomTab, "id" | "createdAt" | "order">): CustomTab`
- `updateCustomTab(id: string, patch: Partial<CustomTab>): void`
- `deleteCustomTab(id: string): void`
- `moveCustomTab(id: string, direction: -1 | 1): void`
- `getAdminMode(userEmail?: string): AdminMode`
- `setAdminMode(mode: AdminMode, userEmail?: string): void`
- `interface AdminModeColors (7 members)`
- `ADMIN_MODES: Record<AdminMode, AdminModeColors>`
- `onAdminConfigChange(handler: () => void): () => void`

## Used by (1)

- [`src/built-ins/modules/website-editor/src/pages/CustomisePage.tsx`](../pages/CustomisePage.md)

