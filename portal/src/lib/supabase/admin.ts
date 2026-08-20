import "server-only";

import { createClient, type User } from "@supabase/supabase-js";

import { isMissingAgencyIdColumn } from "./enquiryAgencyColumn";

function requireAdminConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase admin access is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return { url, serviceRoleKey };
}

export function createSupabaseAdminClient() {
  const { url, serviceRoleKey } = requireAdminConfig();
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function findSupabaseUserByEmail(email: string): Promise<User | null> {
  const admin = createSupabaseAdminClient();
  const wanted = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Could not read Supabase users: ${error.message}`);
    const match = data.users.find(user => user.email?.toLowerCase() === wanted);
    if (match) return match;
    if (data.users.length < 1000) break;
  }
  return null;
}

interface ProvisionIdentityInput {
  email: string;
  password: string;
  name?: string;
  role: "owner" | "staff" | "client";
  /**
   * The agency this identity belongs to. Stamped onto `profiles.agency_id` so
   * `current_profile_agency_id()` is non-null for this user, which is what turns
   * the null-tolerant `brand_enquiries` policy from "internal users manage
   * EVERY agency" into real per-tenant scoping. Optional: callers that cannot
   * determine an agency (e.g. a client whose agency is unknown at setup) omit
   * it, and the profile is created without the column exactly as before.
   */
  agencyId?: string;
}

export async function provisionSupabaseIdentity(input: ProvisionIdentityInput) {
  const admin = createSupabaseAdminClient();
  const email = input.email.trim().toLowerCase();
  const existing = await findSupabaseUserByEmail(email);
  if (existing) {
    throw new Error("A Supabase sign-in already exists for that email.");
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.name?.trim() || email.split("@")[0] },
  });
  if (error || !data.user) {
    throw new Error(error?.message ?? "Could not create the Supabase sign-in.");
  }

  const agencyId = input.agencyId?.trim() || undefined;
  const baseProfile = {
    id: data.user.id,
    email,
    full_name: input.name?.trim() || email.split("@")[0],
    role: input.role,
  };

  // `agency_id` is added to `profiles` by the hand-applied migration, so the
  // generated Supabase types (which brand the row to reject unknown columns)
  // do not know it yet — hence the cast. The runtime column check below covers
  // the pre-migration window where the column genuinely is not there.
  const stampedProfile = { ...baseProfile, agency_id: agencyId };
  let { error: profileError } = await admin
    .from("profiles")
    .upsert((agencyId ? stampedProfile : baseProfile) as never);
  if (profileError && agencyId && isMissingAgencyIdColumn(profileError)) {
    // `profiles.agency_id` is added by the same hand-applied migration as
    // `brand_enquiries.agency_id`. Before it runs, provisioning must not break:
    // retry without the column. The tenant scoping it enables simply switches on
    // once Ed applies the migration and this path stops being taken.
    ({ error: profileError } = await admin.from("profiles").upsert(baseProfile));
  }
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(`Could not create the account profile: ${profileError.message}`);
  }

  return data.user;
}

export async function updateSupabasePassword(email: string, password: string) {
  const admin = createSupabaseAdminClient();
  const user = await findSupabaseUserByEmail(email);
  if (!user) throw new Error("Supabase sign-in not found for this account.");
  const { error } = await admin.auth.admin.updateUserById(user.id, { password });
  if (error) throw new Error(`Could not update the Supabase password: ${error.message}`);
}
