import { ViewTabs } from "../_ui";
import { AuditorSection } from "../auditor/_Section";
import { FindingsSection } from "./_Section";

// Findings — one section, two ways the same thing gets found.
//
// Ed's call: "auditor and findings can also be combined — same thing, just one's
// manual and one's automated." So they are two views of one place: what I spot
// while using the app, and what the audit sweep spots on its own. Both end the
// same way — selected, turned into a plan, handed to a worker.
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function FindingsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const view = params.view === "auditor" ? "auditor" : "mine";
  const tabs = <ViewTabs section="findings" active={view} />;
  return view === "auditor" ? <AuditorSection tabs={tabs} /> : <FindingsSection tabs={tabs} />;
}
