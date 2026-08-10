import { redirect } from "next/navigation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Params = Promise<{ template: string }>;

export default async function LegacyPortalTemplateDemoPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { template } = await params;
  const query = await searchParams;
  const next = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) value.forEach(item => next.append(key, item));
    else if (value !== undefined) next.set(key, value);
  }

  const suffix = next.size ? `?${next.toString()}` : "";
  redirect(`/portal/preview/${encodeURIComponent(template)}${suffix}`);
}
