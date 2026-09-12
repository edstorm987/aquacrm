// Keep non-route exports out of this Next special file. Tests and dependency
// injection use `handler.ts`; this file exposes only the supported HTTP method.
import type { NextRequest } from "next/server";
import { handlePasswordResetRequest } from "./handler";

export function POST(req: NextRequest) {
  return handlePasswordResetRequest(req);
}
