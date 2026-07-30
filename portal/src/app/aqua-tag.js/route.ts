import { aquaTagResponse } from "@/lib/aquaTagSource";

export async function GET() {
  return aquaTagResponse();
}
