import { Suspense, type ReactNode } from "react";
import { PortalViewportLoading } from "@/components/ui/PortalViewportLoading";
import { ViewTabs } from "../_ui";

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

function ViewLoading({ tabs, label }: { tabs: ReactNode; label: string }) {
  void tabs;
  return <PortalViewportLoading label={`Preparing ${label}…`} testId="dev-team-library-view-loading" />;
}

async function DocsView({ tabs, searchParams }: { tabs: ReactNode; searchParams: SearchParams }) {
  const { LibrarySection } = await import("./_Section");
  return <LibrarySection tabs={tabs} searchParams={searchParams} />;
}

async function LogsView({ tabs }: { tabs: ReactNode }) {
  const { LogsSection } = await import("../logs/_Section");
  return <LogsSection tabs={tabs} />;
}

async function UpdatesView({ tabs }: { tabs: ReactNode }) {
  const { UpdatesSection } = await import("../updates/_Section");
  return <UpdatesSection tabs={tabs} />;
}

export default async function LibraryPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const view = params.view === "logs" ? "logs" : params.view === "updates" ? "updates" : "docs";
  const tabs = <ViewTabs section="library" active={view} />;

  if (view === "logs") {
    return <Suspense fallback={<ViewLoading tabs={tabs} label="logs" />}><LogsView tabs={tabs} /></Suspense>;
  }
  if (view === "updates") {
    return <Suspense fallback={<ViewLoading tabs={tabs} label="updates" />}><UpdatesView tabs={tabs} /></Suspense>;
  }
  return (
    <Suspense fallback={<ViewLoading tabs={tabs} label="documents" />}>
      <DocsView tabs={tabs} searchParams={searchParams} />
    </Suspense>
  );
}
