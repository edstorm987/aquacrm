import { ViewTabs } from "../_ui";
import { ApiSection } from "../api/_Section";
import { EditorSection } from "../editor/_Section";
import { InspectorSection } from "../inspector/_Section";

// Tools — the controls, as opposed to the record.
//
// Everything here ACTS on the system rather than describing it: step into
// another role and look around (Inspector), change the app itself (Editor), or
// open it up to machines (API & MCP). Three sidebar rows became one section
// with three views.
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function ToolsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const view = params.view === "editor" ? "editor" : params.view === "api" ? "api" : "inspector";
  const tabs = <ViewTabs section="tools" active={view} />;

  if (view === "editor") return <EditorSection tabs={tabs} />;
  if (view === "api") return <ApiSection tabs={tabs} searchParams={searchParams} />;
  return <InspectorSection tabs={tabs} />;
}
