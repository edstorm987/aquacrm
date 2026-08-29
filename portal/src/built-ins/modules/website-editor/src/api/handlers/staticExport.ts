// R033 — Static export handler. GET /export?siteId=…&baseUrl=… returns
// a ZIP buffer (application/zip) containing every published page in the
// site rendered to static HTML, plus brand.css, sitemap.xml, robots.txt,
// and a README that spells out which dynamic surfaces won't survive the
// snapshot.

import type { PluginCtx } from "../../lib/aquaPluginTypes";
import { fail, readQuery, requireClientScope } from "../helpers";
import { exportSiteToZip } from "../../server/staticExport";
import { clientSupabaseExportTarget } from "@/lib/server/clientForms/clientSupabaseExport";
import type { AgencyId, ClientId, BrandKit } from "../../lib/tenancy";

export async function handleExportSite(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  if (!q.siteId) return fail("siteId required", 400);

  const baseUrl = q.baseUrl ?? `https://${q.siteId}.example`;
  const brandKit = (ctx as unknown as { brand?: BrandKit }).brand;

  // The client's own Supabase, if they have one connected. Absent is fine and
  // is not an error: the export then renders forms that say they are not
  // connected rather than a Send button that throws the message away.
  //
  // Only the PUBLIC half is read — project URL, anon key and table. The webhook
  // secret is deliberately not passed anywhere near a downloadable bundle.
  const supabase = clientSupabaseExportTarget(scope.clientId as string);

  const result = await exportSiteToZip({
    storage: ctx.storage,
    agencyId: scope.agencyId as AgencyId,
    clientId: scope.clientId as ClientId,
    siteId: q.siteId,
    baseUrl,
    brandKit,
    supabase,
  });

  const filename = `${q.siteId}-export-${new Date().toISOString().slice(0, 10)}.zip`;
  return new Response(result.zip as BodyInit, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${filename}"`,
      "x-aqua-export-pages": String(result.pageCount),
      "x-aqua-export-files": String(result.fileCount),
    },
  });
}
