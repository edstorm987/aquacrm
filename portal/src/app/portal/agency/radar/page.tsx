import { redirect } from "next/navigation";

export default async function RadarInspectionPage({ searchParams }: { searchParams: Promise<{ view?: string; query?: string; domain?: string; status?: string; scope?: string; lens?: string; source?: string; dataset?: string }> }) {
  const requested = await searchParams;
  const params = new URLSearchParams({ station: "radar-inspector" });
  for (const key of ["view", "query", "domain", "status", "scope", "lens", "source", "dataset"] as const) {
    const value = requested[key];
    if (typeof value === "string" && value.trim()) params.set(key, value.trim().slice(0, 240));
  }
  redirect(`/portal/agency?${params.toString()}`);
}
