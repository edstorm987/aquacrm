import PerformancePage from "../../performance/page";
import { DevelopmentNav } from "../_DevelopmentNav";

export default async function DevelopmentPerformancePage() {
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
