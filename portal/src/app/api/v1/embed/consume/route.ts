import type { NextRequest } from "next/server";

import { handleEmbedSessionConsume } from "@/lib/server/embedSessionHandlers";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return handleEmbedSessionConsume(request);
}
