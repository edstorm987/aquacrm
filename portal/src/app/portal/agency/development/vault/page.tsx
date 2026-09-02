import { DevelopmentNav } from "../_DevelopmentNav";
import { DevelopmentToolkitWorkspace } from "../_DevelopmentToolkitWorkspace";
import { loadDevelopmentData } from "../_loadDevelopmentData";

export default async function DevelopmentVaultPage() {
  const data = await loadDevelopmentData("vault");
  return <div className="mx-auto flex w-full max-w-7xl flex-col gap-7"><DevelopmentNav active="vault" /><DevelopmentToolkitWorkspace mode="vault" initialResources={data.resources} initialTotal={data.total} initialCategories={data.categories} initialWorkflows={data.workflows} sops={data.sops} technicalAccessLevel={data.technicalAccessLevel} /></div>;
}
