import PerformancePage from "../../performance/page";
import { requireCurrentFulfilmentTechnicalAccess } from "@/lib/server/access/fulfilmentTechnicalAccess";
import { DevelopmentNav } from "../_DevelopmentNav";

export default async function DevelopmentPerformancePage() {
  await requireCurrentFulfilmentTechnicalAccess("view");
  const workspace = await PerformancePage();

  return (
    <div className="flex w-full flex-col gap-7">
      <div className="mx-auto w-full max-w-7xl">
        <DevelopmentNav active="performance" />
      </div>
      {workspace}
    </div>
  );
}
