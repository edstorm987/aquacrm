// R033 — Static export handler. GET /export?siteId=…&baseUrl=… returns
// a ZIP buffer (application/zip) containing every published page in the
// site rendered to static HTML, plus brand.css, sitemap.xml, robots.txt,
// and a README that spells out which dynamic surfaces won't survive the
// snapshot.

import type { PluginCtx } from "../../lib/aquaPluginTypes";
import { fail, readQuery, requireClientScope } from "../helpers";
import { exportSiteToZip } from "../../server/staticExport";
import { PageBlockValidationError } from "../../server/pageBlockValidation";
import type { AgencyId, ClientId, BrandKit } from "../../lib/tenancy";

// Namespace, not a named import: this plugin is ESM ("type": "module") while
// `portal/src/lib/**` is CommonJS to the smoke runner's loader, and a named
// import across that boundary throws "does not provide an export named
// 'clientSupabaseExportTarget'" at instantiation. Same one-implementation
// indirection as `lib/menuKeys.ts` — see its header.
import * as sharedSupabaseExport from "@/lib/server/clientForms/clientSupabaseExport";

type SupabaseExportNs = typeof sharedSupabaseExport & {
  default?: typeof sharedSupabaseExport;
};
const supabaseExportNs = sharedSupabaseExport as SupabaseExportNs;
const clientSupabaseExportTarget =
  supabaseExportNs.clientSupabaseExportTarget ??
  supabaseExportNs.default!.clientSupabaseExportTarget;

export async function handleExportSite(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  if (!q.siteId) return fail("siteId required", 400);

  const baseUrl = q.baseUrl ?? `https://${q.siteId}.example`;
  const brandKit = (ctx as unknown as { brand?: BrandKit }).brand;

  // The client's own Supabase intake, if they have one connected, tested, active
  // AND approved-and-bound to THIS site. Absent is the normal, fail-closed answer
  // (not an error): the export then renders inert forms that say they are not
  // connected rather than a Send button that throws the message away.
  //
  // Only the PUBLIC half is read — the Edge Function URL, the public form id and
  // the public Turnstile site key. No table, no anon/service key, and neither the
  // webhook nor the read secret is passed anywhere near a downloadable bundle.
  // `siteId` is required: approval binds a connection to exactly one site. The
  // agency is passed too, so the lookup is bound to the exact tenant that owns
  // the connection, never a client id on its own.
  const supabase = clientSupabaseExportTarget(scope.agencyId as string, scope.clientId as string, q.siteId);

  let result;
  try {
    result = await exportSiteToZip({
      storage: ctx.storage,
      agencyId: scope.agencyId as AgencyId,
      clientId: scope.clientId as ClientId,
      siteId: q.siteId,
      baseUrl,
      brandKit,
      supabase,
    });
  } catch (error) {
    if (error instanceof PageBlockValidationError) {
      return fail("stored page content failed security validation", 422);
    }
    throw error;
  }

  // `Block.type` is a deliberately OPEN string (see `types/block.ts`) and page
  // trees are persisted unvalidated, so a stored type can contain a CR/LF that
  // `new Response()` rejects outright — which would turn a working export into
  // a 500 for the sake of a header. Keep the header to printable ASCII and let
  // the README (which is not so constrained) carry the exact names.
  const headerSafeTypes = result.unexportableBlockTypes
    .map(t => t.replace(/[^\x20-\x7E]/g, "").replace(/,/g, " ").trim())
    .filter(Boolean);

  const filename = `${q.siteId}-export-${new Date().toISOString().slice(0, 10)}.zip`;
  return new Response(result.zip as BodyInit, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${filename}"`,
      "x-aqua-export-pages": String(result.pageCount),
      "x-aqua-export-files": String(result.fileCount),
      // Not decoration: a caller that only reads the status code would report
      // "exported" for a bundle whose product grids and pricing tables were
      // dropped. The types are named, not just counted.
      "x-aqua-export-unsupported-blocks": String(result.unexportableBlockTypes.length),
      ...(headerSafeTypes.length
        ? { "x-aqua-export-unsupported-block-types": headerSafeTypes.join(",") }
        : {}),
    },
  });
}
