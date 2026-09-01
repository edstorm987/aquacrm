import { redirect } from "next/navigation";

/**
 * The browser-local Sites registry was retired in favour of the canonical
 * client Dev Editor workspace. Keep old bookmarks useful without mounting the
 * legacy screen or any of its unregistered API calls.
 */
export default async function LegacyClientSitesPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  redirect(`/portal/clients/${encodeURIComponent(clientId)}/edit-website`);
}
