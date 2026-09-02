import type { ChecklistView, ChecklistViewItem } from "../server/checklist";

/** Apply a confirmed tick to the render-ready view without waiting for reload. */
export function checklistViewAfterTick(
  view: ChecklistView,
  itemId: string,
  done: boolean,
): ChecklistView {
  const update = (items: ChecklistViewItem[]): ChecklistViewItem[] =>
    items.map(item => item.id === itemId ? { ...item, done } : item);
  const internal = update(view.internal);
  const client = update(view.client);
  const internalDone = internal.filter(item => item.done).length;
  const clientDone = client.filter(item => item.done).length;
  return {
    ...view,
    internal,
    client,
    internalDone,
    clientDone,
    allRequiredComplete:
      internalDone === internal.length && clientDone === client.length,
  };
}
