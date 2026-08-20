import { ViewTabs } from "../_ui";
import { LogsSection } from "../logs/_Section";
import { UpdatesSection } from "../updates/_Section";
import { LibrarySection } from "./_Section";

// Library — the written record of this workspace, at three angles.
//
//   Docs    — every plan, phase, feature and doc, live off disk (and editable).
//   Logs    — what has been happening: check-ins, file activity, signed edits.
//   Updates — the changelog we publish to the Master Inbox.
//
// `?view=recent` and `?doc=` belong to the Docs view and pass straight through,
// so every existing Library link keeps working.
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function LibraryPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const view = params.view === "logs" ? "logs" : params.view === "updates" ? "updates" : "docs";
  const tabs = <ViewTabs section="library" active={view} />;

  if (view === "logs") return <LogsSection tabs={tabs} />;
  if (view === "updates") return <UpdatesSection tabs={tabs} />;
  return <LibrarySection tabs={tabs} searchParams={searchParams} />;
}
