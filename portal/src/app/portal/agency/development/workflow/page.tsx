import { DevelopmentNav } from "../_DevelopmentNav";
import { DevelopmentToolkitWorkspace } from "../_DevelopmentToolkitWorkspace";
import { loadDevelopmentData } from "../_loadDevelopmentData";

export default async function DevelopmentWorkflowPage() {
  const data = await loadDevelopmentData("workflow");
  return <div className="mx-auto flex w-full max-w-7xl flex-col gap-7"><DevelopmentNav active="workflow" /><DevelopmentToolkitWorkspace mode="workflow" initialResources={data.resources} initialTotal={data.total} initialCategories={data.categories} initialWorkflows={data.workflows} sops={data.sops} role={data.role} /></div>;
}
