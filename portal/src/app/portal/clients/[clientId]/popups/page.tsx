import { redirect } from "next/navigation";

/**
 * The old Popups screen only changed browser-local state and had no published
 * renderer. Preserve bookmarks by opening the canonical shared editor.
 */
export default async function RetiredClientPopupsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  redirect(`/portal/clients/${encodeURIComponent(clientId)}/editor`);
}
