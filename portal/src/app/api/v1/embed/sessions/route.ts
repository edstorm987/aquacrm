import type { NextRequest } from "next/server";

import { handleEmbedSessionMint } from "@/lib/server/embedSessionHandlers";

export const dynamic = "force-dynamic";

export function POST(request: NextRequest) {
  return handleEmbedSessionMint(request);
}
