import "server-only";

import { createClient, type User } from "@supabase/supabase-js";

import { isMissingAgencyIdColumn } from "./enquiryAgencyColumn";
import {
  createWriteAdmittedFetch,
  guardServiceRoleClient,
  type ServiceRoleEffectContext,
} from "./guardedServiceRoleClient";
import { resolveSupabaseSecretKey, resolveSupabaseUrl } from "./keys";

function requireAdminConfig() {
  const url = resolveSupabaseUrl();
  const serviceRoleKey = resolveSupabaseSecretKey();
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase admin access is not configured. Set the Supabase URL and a server key (SUPABASE_SECRET_KEY or legacy SUPABASE_SERVICE_ROLE_KEY).",
    );
  }
  return { url, serviceRoleKey };
}

export function createSupabaseAdminClient(context: Partial<ServiceRoleEffectContext> = {}) {
  const { url, serviceRoleKey } = requireAdminConfig();
  const effectContext: ServiceRoleEffectContext = {
    surface: context.surface ?? "database.supabase.service-role",
    tenantId: context.tenantId,
    platformPurpose: context.platformPurpose,
    actor: context.actor,
  };
  return guardServiceRoleClient(
    createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: createWriteAdmittedFetch(effectContext) },
    }),
    effectContext,
  );
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

export interface ProvisionIdentityInput {
  email: string;
  password: string;
  name?: string;
  role: "owner" | "staff" | "client";
  /** Trusted tenant lineage for the remote identity and profile mutations. */
  agencyId: string;
  /** Durable local operation that is allowed to adopt this exact remote result. */
  operationId?: string;
}

async function upsertSupabaseProfile(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  input: ProvisionIdentityInput,
  email: string,
): Promise<void> {
  const agencyId = input.agencyId?.trim() || undefined;
  const baseProfile = {
    id: userId,
    email,
    full_name: input.name?.trim() || email.split("@")[0],
    role: input.role,
  };
  const stampedProfile = { ...baseProfile, agency_id: agencyId };
  let { error: profileError } = await admin
    .from("profiles")
    .upsert((agencyId ? stampedProfile : baseProfile) as never);
  if (profileError && agencyId && isMissingAgencyIdColumn(profileError)) {
    ({ error: profileError } = await admin.from("profiles").upsert(baseProfile));
  }
  if (profileError) {
    throw new Error(`Could not create the account profile: ${profileError.message}`);
  }
}

export async function provisionSupabaseIdentity(input: ProvisionIdentityInput) {
  const agencyId = input.agencyId.trim();
  if (!agencyId) throw new Error("Supabase identity provisioning requires an agency id.");
  const admin = createSupabaseAdminClient({ tenantId: agencyId });
  const email = input.email.trim().toLowerCase();
  const existing = await findSupabaseUserByEmail(email);
  if (existing) {
    throw new Error("A Supabase sign-in already exists for that email.");
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      full_name: input.name?.trim() || email.split("@")[0],
      ...(input.operationId ? {
        aqua_provisioning_operation_id: input.operationId,
        aqua_agency_id: input.agencyId?.trim() || null,
        aqua_profile_role: input.role,
      } : {}),
    },
  });
  if (error || !data.user) {
    throw new Error(error?.message ?? "Could not create the Supabase sign-in.");
  }

  try {
    await upsertSupabaseProfile(admin, data.user.id, input, email);
  } catch (error) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw error;
  }

  return data.user;
}

/**
 * Resumable staff provisioning. An existing Supabase user is adopted only when
 * it carries the marker written by this exact durable operation; unrelated
 * identities with the same email keep the original hard refusal.
 */
export async function provisionOrAdoptSupabaseIdentity(input: ProvisionIdentityInput): Promise<{
  user: User;
  adopted: boolean;
}> {
  if (!input.operationId) throw new Error("A durable provisioning operation id is required.");
  const email = input.email.trim().toLowerCase();
  const existing = await findSupabaseUserByEmail(email);
  if (!existing) {
    return { user: await provisionSupabaseIdentity(input), adopted: false };
  }

  const metadata = existing.user_metadata ?? {};
  if (
    metadata.aqua_provisioning_operation_id !== input.operationId
    || metadata.aqua_agency_id !== (input.agencyId?.trim() || null)
    || metadata.aqua_profile_role !== input.role
  ) {
    throw new Error("A Supabase sign-in already exists for that email and was not created by this provisioning operation.");
  }

  const admin = createSupabaseAdminClient({ tenantId: input.agencyId });
  const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
    password: input.password,
    email_confirm: true,
    user_metadata: {
      ...metadata,
      full_name: input.name?.trim() || email.split("@")[0],
    },
  });
  if (error || !data.user) throw new Error(error?.message ?? "Could not adopt the Supabase sign-in.");
  await upsertSupabaseProfile(admin, existing.id, input, email);
  return { user: data.user, adopted: true };
}

export async function updateSupabasePassword(email: string, password: string) {
  const admin = createSupabaseAdminClient({
    platformPurpose: "incident-auth-recovery",
    surface: "identity.password-recovery",
    actor: "password-recovery",
  });
  const user = await findSupabaseUserByEmail(email);
  if (!user) throw new Error("Supabase sign-in not found for this account.");
  const { error } = await admin.auth.admin.updateUserById(user.id, { password });
  if (error) throw new Error(`Could not update the Supabase password: ${error.message}`);
}
