import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface BrandEnquiry {
  id: string;
  brand_slug: string;
  name: string;
  email: string | null;
  phone: string | null;
  contact_method: string | null;
  services: string[];
  message: string | null;
  source_url: string | null;
  campaign: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export async function getBrandEnquiries() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("brand_enquiries")
    .select("id,brand_slug,name,email,phone,contact_method,services,message,source_url,campaign,metadata,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return (data || []) as BrandEnquiry[];
}
