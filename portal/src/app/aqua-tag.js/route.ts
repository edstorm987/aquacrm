import { aquaTagResponse } from "@/lib/integrations/aquaTagSource";

export async function GET() {
  return aquaTagResponse();
}
