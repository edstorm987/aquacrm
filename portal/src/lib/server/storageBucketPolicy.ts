/**
 * AquaCRM owns two Supabase Storage buckets with deliberately different
 * exposure contracts. Their names are part of the database migration contract,
 * not tenant-configurable aliases: accepting an arbitrary environment value can
 * turn a private upload into a public object while still using the service role.
 */
export const AQUACRM_PRIVATE_UPLOAD_BUCKET = "aquacrm-uploads";
export const AQUACRM_PUBLIC_UPLOAD_BUCKET = "aquacrm-public";

export interface StorageBucketPolicyIssue {
  name: "NEXT_PUBLIC_SUPABASE_UPLOAD_BUCKET" | "NEXT_PUBLIC_SUPABASE_PUBLIC_BUCKET";
  reason: string;
}

export interface StorageBucketPolicyInspection {
  privateBucket: string;
  publicBucket: string;
  valid: boolean;
  issues: StorageBucketPolicyIssue[];
}

export class StorageBucketConfigurationError extends Error {
  readonly code = "storage_bucket_configuration_invalid";

  constructor() {
    super("AquaCRM storage bucket configuration is invalid. Private storage access has been disabled.");
    this.name = "StorageBucketConfigurationError";
  }
}

/** Pure policy inspection for startup/readiness checks and hermetic tests. */
export function inspectStorageBucketPolicy(
  env: NodeJS.ProcessEnv = process.env,
): StorageBucketPolicyInspection {
  const configuredPrivateBucket = env.NEXT_PUBLIC_SUPABASE_UPLOAD_BUCKET;
  const configuredPublicBucket = env.NEXT_PUBLIC_SUPABASE_PUBLIC_BUCKET;
  const privateBucket = configuredPrivateBucket?.trim()
    || AQUACRM_PRIVATE_UPLOAD_BUCKET;
  const publicBucket = configuredPublicBucket?.trim()
    || AQUACRM_PUBLIC_UPLOAD_BUCKET;
  const issues: StorageBucketPolicyIssue[] = [];

  if (configuredPrivateBucket && configuredPrivateBucket !== AQUACRM_PRIVATE_UPLOAD_BUCKET) {
    issues.push({
      name: "NEXT_PUBLIC_SUPABASE_UPLOAD_BUCKET",
      reason: `must equal "${AQUACRM_PRIVATE_UPLOAD_BUCKET}" so private bytes cannot be routed to another ecosystem bucket`,
    });
  }
  if (configuredPublicBucket && configuredPublicBucket !== AQUACRM_PUBLIC_UPLOAD_BUCKET) {
    issues.push({
      name: "NEXT_PUBLIC_SUPABASE_PUBLIC_BUCKET",
      reason: `must equal "${AQUACRM_PUBLIC_UPLOAD_BUCKET}" so public-media policy cannot be redirected to another ecosystem bucket`,
    });
  }
  if (privateBucket === publicBucket) {
    issues.push({
      name: "NEXT_PUBLIC_SUPABASE_UPLOAD_BUCKET",
      reason: "must never equal NEXT_PUBLIC_SUPABASE_PUBLIC_BUCKET; private and public storage are separate security zones",
    });
  }

  return {
    privateBucket,
    publicBucket,
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Runtime choke point. Call before every service-role private Storage request;
 * startup/readiness validation is defence in depth and may not have run in a
 * test, script, background worker or partially booted process.
 */
export function resolvePrivateUploadBucket(
  env: NodeJS.ProcessEnv = process.env,
): typeof AQUACRM_PRIVATE_UPLOAD_BUCKET {
  const inspection = inspectStorageBucketPolicy(env);
  if (!inspection.valid) throw new StorageBucketConfigurationError();
  return AQUACRM_PRIVATE_UPLOAD_BUCKET;
}
