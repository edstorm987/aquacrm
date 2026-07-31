import { NextResponse } from "next/server";

import { getPortalSession } from "@/lib/auth";
import { jsonError, noStoreHeaders } from "@/lib/route-security";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const session = await getPortalSession();
  if (!session || session.role !== "admin") return jsonError("Unauthorised.", 401);

  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("brands")
      .select("slug,name")
      .order("slug", { ascending: true });

    if (error) {
      console.error("Supabase health check failed", error);
      return jsonError("Supabase health check failed.", 500);
    }

    return NextResponse.json({
      ok: true,
      brands: data,
    }, {
      headers: noStoreHeaders(),
    });
  } catch (error) {
    console.error("Supabase health route failed", error);
    return jsonError("Supabase health check failed.", 500);
  }
}
