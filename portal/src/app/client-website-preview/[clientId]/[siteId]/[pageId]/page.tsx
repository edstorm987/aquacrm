import { notFound } from "next/navigation";
import { PortalPageRenderer } from "@/built-ins/modules/website-editor/src/components/storefront/PortalPageRenderer";
import { getPage } from "@/built-ins/modules/website-editor/src/server/pages";
import { getDefaultTheme, getTheme } from "@/built-ins/modules/website-editor/src/server/themes";
import { requireRoleForClient } from "@/lib/server/auth";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { ensureHydrated } from "@/server/storage";
import { listInstalledForClientOnly } from "@/server/pluginInstalls";
import { AGENCY_ROLES } from "@/server/types";

export const dynamic = "force-dynamic";

interface PreviewProps {
  params: Promise<{ clientId: string; siteId: string; pageId: string }>;
}

export default async function ClientWebsitePreview({ params }: PreviewProps) {
  await ensureHydrated();
  const { clientId, siteId, pageId } = await params;
  const session = await requireRoleForClient([...AGENCY_ROLES], clientId);
  const install = listInstalledForClientOnly({ agencyId: session.agencyId, clientId })
    .find(candidate => candidate.pluginId === "website-editor" && candidate.enabled);
  if (!install) notFound();

  const storage = makePluginStorage(install.id);
  const page = await getPage(storage, session.agencyId, clientId, siteId, pageId);
  if (!page) notFound();
  const theme = page.themeId
    ? await getTheme(storage, session.agencyId, clientId, siteId, page.themeId)
    : await getDefaultTheme(storage, session.agencyId, clientId, siteId);

  return (
    <main className="min-h-screen bg-white text-slate-950" data-client-website-preview>
      {page.customHead ? <div className="contents" dangerouslySetInnerHTML={{ __html: page.customHead }} /> : null}
      <PortalPageRenderer page={page} theme={theme} preview />
      {page.customFoot ? <div className="contents" dangerouslySetInnerHTML={{ __html: page.customFoot }} /> : null}
    </main>
  );
}
