import { DevelopmentNav } from "../_DevelopmentNav";
import { DevelopmentToolkitWorkspace } from "../_DevelopmentToolkitWorkspace";
import { loadDevelopmentData } from "../_loadDevelopmentData";

export default async function DevelopmentToolkitPage() {
  const data = await loadDevelopmentData("toolkit");
  return <div className="mx-auto flex w-full max-w-7xl flex-col gap-7"><DevelopmentNav active="toolkit" /><DevelopmentToolkitWorkspace mode="toolkit" initialResources={data.resources} initialTotal={data.total} initialCategories={data.categories} initialWorkflows={data.workflows} sops={data.sops} technicalAccessLevel={data.technicalAccessLevel} /></div>;
}
