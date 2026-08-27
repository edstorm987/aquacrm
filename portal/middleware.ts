import type { NextRequest } from "next/server";
import { proxy } from "./src/proxy";

export const config = {
  matcher: ["/portal/:path*", "/api/:path*"],
  runtime: "nodejs",
};

export function middleware(req: NextRequest) {
  return proxy(req);
}
