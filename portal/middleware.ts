import { NextResponse, type NextRequest } from "next/server";

export const config = {
  matcher: ["/portal/:path*"],
  runtime: "nodejs",
};

export function middleware(_req: NextRequest) {
  return NextResponse.next();
}
