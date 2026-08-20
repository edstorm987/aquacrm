import { aquaTagResponse } from "@/lib/integrations/aquaTagSource";

// Compatibility URL for existing installations. New properties should load
// /aqua-tag.js; keeping this route avoids losing telemetry during migration.
export async function GET() {
  const response = aquaTagResponse();
  response.headers.set("deprecation", "true");
  response.headers.set("sunset", "Wed, 30 Dec 2026 23:59:59 GMT");
  response.headers.set("link", '</aqua-tag.js>; rel="successor-version"');
  return response;
}
