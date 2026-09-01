import { redirect } from "next/navigation";

/**
 * The retired Page Detail route edited an unrelated browser-local page model.
 * Send old bookmarks to the canonical tenant-scoped Pages catalogue.
 */
export default async function RetiredClientPageDetail({
  params,
}: {
  params: Promise<{ clientId: string; pageId: string }>;
}) {
  const { clientId } = await params;
  redirect(`/portal/clients/${encodeURIComponent(clientId)}/pages`);
}
