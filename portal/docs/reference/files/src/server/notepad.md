# `src/server/notepad.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (10)

- `interface CreateNotepadNoteInput (5 members)`
- `interface UpdateNotepadNoteInput (6 members)`
- `listNotepadFolders(agencyId: string, userId: string): NotepadFolder[]`
- `listNotepadNotes(agencyId: string, userId: string): NotepadNote[]`
- `createNotepadFolder(agencyId: string, userId: string, input: { name?: string; color?: string }): NotepadFolder`
- `updateNotepadFolder(agencyId: string, userId: string, folderId: string, input: { name?: string; color?: string }): NotepadFolder | null`
- `deleteNotepadFolder(agencyId: string, userId: string, folderId: string): boolean`
- `createNotepadNote(agencyId: string, userId: string, input: CreateNotepadNoteInput = {}): NotepadNote`
- `updateNotepadNote(agencyId: string, userId: string, noteId: string, patch: UpdateNotepadNoteInput): NotepadNote | null`
- `permanentlyDeleteNotepadNote(agencyId: string, userId: string, noteId: string): boolean`

## Depends on (2)

- [`src/server/storage.ts`](./storage.md)
- [`src/server/types.ts`](./types.md)

## Used by (5)

- [`src/app/api/portal/notepad/route.ts`](../app/api/portal/notepad/route.md)
- [`src/app/api/portal/search/route.ts`](../app/api/portal/search/route.md)
- [`src/app/portal/agency/notepad/page.tsx`](../app/portal/agency/notepad/page.md)
- [`src/app/portal/dev-team/notes/page.tsx`](../app/portal/dev-team/notes/page.md)
- [`src/app/portal/team/_data.ts`](../app/portal/team/_data.md)

