export interface UnsavedEditorWork {
  portalDraft?: boolean;
  seoFields?: boolean;
  repositoryFiles?: number;
  pagePreview?: boolean;
}

/**
 * Name every kind of work a navigation would discard.
 *
 * The editor owns state in several children. Keeping this list pure makes the
 * confirmation sentence testable and stops a new editor surface from being
 * silently omitted from the navigation guard.
 */
export function unsavedEditorWork(input: UnsavedEditorWork): string[] {
  const work: string[] = [];
  if (input.portalDraft) work.push("the unsaved changes in this portal draft");
  if (input.seoFields) work.push("the SEO fields filled in for this page");
  if ((input.repositoryFiles ?? 0) > 0) {
    const count = input.repositoryFiles ?? 0;
    work.push(`${count} unsaved repository ${count === 1 ? "file" : "files"}`);
  }
  if (input.pagePreview) work.push("the unsaved preview changes on this page");
  return work;
}

function sentenceList(items: string[]): string {
  if (items.length < 2) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

/** Empty means there is nothing to confirm. */
export function editorDiscardPrompt(input: UnsavedEditorWork): string {
  const work = unsavedEditorWork(input);
  return work.length ? `Discard ${sentenceList(work)}?` : "";
}
