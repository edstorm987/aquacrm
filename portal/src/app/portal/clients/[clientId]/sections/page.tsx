import { redirect } from "next/navigation";

/**
 * The old Sections screen only changed browser-local state that no storefront
 * consumed. Preserve bookmarks by opening the canonical shared editor.
 */
export default async function RetiredClientSectionsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  redirect(`/portal/clients/${encodeURIComponent(clientId)}/editor`);
}
