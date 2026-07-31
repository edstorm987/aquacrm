import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { noStoreHeaders } from "@/lib/route-security";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
    headers: noStoreHeaders(),
  });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
