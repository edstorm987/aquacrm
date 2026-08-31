import {
  inspectObservabilityCapability,
  type ObservabilityCapability,
} from "./observabilityCapability";

export type ReadinessStatus = "ready" | "needs-setup" | "optional";
export type ReadinessGroup = "core" | "communication" | "money" | "development" | "intelligence";

/**
 * Who a readiness row belongs to.
 *
 * `platform` — the operator's deployment: the database, the session secret, the
 * upload bucket, the vault key, error monitoring. Only whoever can redeploy can
 * change them, so they are meaningless to a tenant and are hidden from one.
 * `company` — the buying agency's own: their email sender, their Stripe, their
 * GitHub, their assistant key. Every one has an in-app path in Company →
 * Connections.
 *
 * This is the split `docs/workspace/env-and-sellability.md` §3 asks for. Without
 * it every row was decided by `process.env` and a sold instance read
 * "production setup is incomplete" forever, with nothing on the screen a buyer
 * could act on.
 */
export type ReadinessScope = "platform" | "company";

export interface ReadinessItem {
  id:
    | "database"
    | "security"
    | "vault"
    | "email"
    | "uploads"
    | "billing"
    | "google"
    | "github"
    | "vercel"
    | "assistant"
    | "assistant-api"
    | "monitoring";
  label: string;
  status: ReadinessStatus;
  summary: string;
  action: string;
  required: boolean;
  group: ReadinessGroup;
  scope: ReadinessScope;
  envKeys: string[];
}

export interface ProductionReadiness {
  ready: boolean;
  environment: "local" | "preview" | "production";
  /**
   * Whose readiness this answer is. `platform` is the operator's full view (no
   * agency in scope, or the founder's own agency, which is the one the
   * environment's credentials belong to). `company` is a tenant's view: company
   * rows only, no environment fallbacks counted, no `envKeys` shipped.
   */
  audience: ReadinessScope;
  items: ReadinessItem[];
}

export interface ReadinessContext {
  activeClientCount?: number;
  billingConfiguredClientCount?: number;
  activeExternalAssistantKeyCount?: number;
  managedIntegrationProviders?: string[];
  /**
   * The agency this readiness view is for. Omit for the deployment-wide view
   * (`/healthz/full`, the Dev Team dashboard, `scripts/launch-audit.ts`).
   */
  agencyId?: string;
  /**
   * Whether `process.env` credentials belong to that agency —
   * `mayUseEnvironmentCredentials(agencyId)` from
   * `lib/server/auth/founderAgency.ts`. Only the founder's own agency may count
   * them: for anybody else an environment variable is somebody else's key, and
   * counting it is what made a sold instance read as "ready" off Ed's mail
   * credentials while its own mail had nowhere to go.
   */
  environmentCredentialsBelongToAgency?: boolean;
  /**
   * `transactionalEmailReadiness(agencyId).configured` — the authority the send
   * path itself uses, so this screen cannot disagree with it. It understands
   * SMTP, which this module used to be blind to: a buyer who connected SMTP was
   * told "customer email not connected" forever and, because the email row is
   * required, the whole instance read `ready: false` permanently.
   */
  transactionalEmailConfigured?: boolean;
  /**
   * Whether a public enquiry notification would actually be delivered — key,
   * recipient AND verified sender resolved, the same three values
   * `notifyBrandEnquiry` refuses without. A bare Resend connection is not
   * evidence: `notifyTo` is optional in the catalog, so the row used to go green
   * while nothing had anywhere to land.
   */
  enquiryNotificationsConfigured?: boolean;
  /**
   * Pre-resolved error-monitoring capability. Defaults to probing the
   * runtime (DSN + a resolvable `@sentry/nextjs`); injectable so callers
   * and tests can describe both sides without touching module resolution.
   */
  observabilityCapability?: ObservabilityCapability;
}

function has(env: NodeJS.ProcessEnv, name: string): boolean {
  return Boolean(env[name]?.trim());
}

function isSecurePublicOrigin(value?: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1";
  } catch {
    return false;
  }
}

function isRemoteDatabase(value?: string): boolean {
  if (!value) return false;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "::1";
  } catch {
    return false;
  }
}

export function inspectProductionReadiness(
  env: NodeJS.ProcessEnv = process.env,
  context: ReadinessContext = {},
): ProductionReadiness {
  const managedProviders = new Set(context.managedIntegrationProviders ?? []);
  // A tenant is any agency the environment's credentials do NOT belong to. For
  // them `process.env` is the operator's private configuration: it can neither
  // be read as their setup nor changed by them, so it decides nothing here.
  const audience: ReadinessScope = context.agencyId && !context.environmentCredentialsBelongToAgency
    ? "company"
    : "platform";
  const envCounts = audience === "platform";
  const explicitBackend = env.PORTAL_BACKEND?.trim().toLowerCase();
  const isPublicDeployment = env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview";
  const supabaseReady = has(env, "NEXT_PUBLIC_SUPABASE_URL")
    && has(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY")
    && has(env, "SUPABASE_SERVICE_ROLE_KEY");
  const postgresReady = has(env, "DATABASE_URL")
    && (explicitBackend === "postgres" || !explicitBackend)
    && (!isPublicDeployment || isRemoteDatabase(env.DATABASE_URL));
  const databaseReady = explicitBackend === "postgres"
    ? postgresReady
    : explicitBackend === "supabase"
      ? supabaseReady
      : postgresReady || supabaseReady;
  const securityReady = (env.PORTAL_SESSION_SECRET?.length ?? 0) >= 32
    && env.NEXT_PUBLIC_PORTAL_SECURITY === "strict"
    && isSecurePublicOrigin(env.NEXT_PUBLIC_PORTAL_BASE_URL);
  const vaultReady = (env.PORTAL_VAULT_ENCRYPTION_KEY?.length ?? 0) >= 32;
  // SMTP is a first-class catalog provider that `sendTransactionalEmail` fully
  // supports; asking only about `resend` made an SMTP buyer permanently unready.
  const managedEmailReady = managedProviders.has("resend") || managedProviders.has("smtp");
  const transactionalEmailReady = context.transactionalEmailConfigured
    ?? (managedEmailReady || (envCounts && has(env, "RESEND_API_KEY") && has(env, "MILESYMEDIA_FROM_EMAIL")));
  // Deliberately NOT satisfied by a bare connection: a resolved recipient is the
  // fact, and the caller resolves it through the same routing the send path uses.
  const enquiryEmailReady = context.enquiryNotificationsConfigured
    ?? (envCounts && has(env, "RESEND_API_KEY") && has(env, "ENQUIRY_NOTIFY_TO") && has(env, "ENQUIRY_EMAIL_FROM"));
  const emailReady = transactionalEmailReady && enquiryEmailReady;
  const uploadsReady = (supabaseReady && has(env, "NEXT_PUBLIC_SUPABASE_UPLOAD_BUCKET"))
    || has(env, "BLOB_READ_WRITE_TOKEN")
    || has(env, "BLOB_STORE_ID")
    || has(env, "VERCEL_OIDC_TOKEN");
  const stripeReady = managedProviders.has("stripe")
    || (envCounts && has(env, "STRIPE_SECRET_KEY") && has(env, "STRIPE_WEBHOOK_SECRET"));
  const googleReady = has(env, "GOOGLE_OAUTH_CLIENT_ID") && has(env, "GOOGLE_OAUTH_CLIENT_SECRET");
  const githubReady = managedProviders.has("github") || (envCounts && has(env, "GITHUB_TOKEN"));
  const vercelReady = managedProviders.has("vercel") || (envCounts && has(env, "VERCEL_TOKEN"));
  const assistantReady = managedProviders.has("openai") || (envCounts && has(env, "OPENAI_API_KEY"));
  const assistantApiReady = (context.activeExternalAssistantKeyCount ?? 0) > 0
    || (envCounts && has(env, "AQUACRM_ASSISTANT_API_TOKEN") && has(env, "AQUACRM_ASSISTANT_AGENCY_ID"))
    || (envCounts && has(env, "MILESYMEDIA_ASSISTANT_API_TOKEN") && has(env, "MILESYMEDIA_ASSISTANT_AGENCY_ID"));
  const billingConfigured = context.billingConfiguredClientCount ?? 0;
  const activeClients = context.activeClientCount ?? 0;
  // A DSN string is not evidence of monitoring: `@sentry/nextjs` is an
  // optional dependency and every capture is a silent no-op while it is
  // absent. Report the capability, never the environment variable (#132).
  const monitoring = context.observabilityCapability
    ?? inspectObservabilityCapability(env);

  const items: ReadinessItem[] = [
    {
      id: "database",
      label: "Customer data",
      status: databaseReady ? "ready" : "needs-setup",
      summary: databaseReady ? "Durable Supabase or Postgres storage selected." : "Local file storage is not safe for a live deployment.",
      action: databaseReady ? "No action needed." : "Connect Supabase or Postgres and select the matching portal backend.",
      required: true,
      group: "core",
      scope: "platform",
      envKeys: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL", "PORTAL_BACKEND"],
    },
    {
      id: "security",
      label: "Secure access",
      status: securityReady ? "ready" : "needs-setup",
      summary: securityReady ? "Strict sessions and a secure public origin are configured." : "Production session security is incomplete.",
      action: securityReady
        ? "No action needed."
        : "Set a 32+ character session secret, strict security mode, and the HTTPS portal URL.",
      required: true,
      group: "core",
      scope: "platform",
      envKeys: ["PORTAL_SESSION_SECRET", "NEXT_PUBLIC_PORTAL_SECURITY", "NEXT_PUBLIC_PORTAL_BASE_URL"],
    },
    {
      id: "vault",
      label: "Credential vault",
      status: vaultReady ? "ready" : "optional",
      summary: vaultReady ? "Shared development credentials can be encrypted at rest." : "The development vault cannot safely store shared credentials yet.",
      action: vaultReady ? "No action needed." : "Add an independent 32+ character vault encryption key before storing credentials.",
      required: false,
      group: "core",
      scope: "platform",
      envKeys: ["PORTAL_VAULT_ENCRYPTION_KEY"],
    },
    {
      id: "email",
      label: "Customer email",
      status: emailReady ? "ready" : "needs-setup",
      // Two different failures, and the fix for each is a different screen, so
      // they are never reported as one vague "email is not connected".
      summary: emailReady
        ? "Transactional access and enquiry notifications can be delivered."
        : transactionalEmailReady
          ? "Account mail can be delivered, but a public enquiry has no inbox to land in."
          : "Account mail has no sender: no email provider is connected for this workspace.",
      action: emailReady
        ? "No action needed."
        : transactionalEmailReady
          // Public enquiry alerts leave through Resend and nothing else
          // (`notifyBrandEnquiry` → `sendResendEmail`), so an SMTP-only
          // workspace satisfies the account-mail half and STILL cannot clear
          // this one by adding a support email. Naming only the recipient would
          // offer a remedy that does not resolve the row — say what actually
          // clears it, both halves of it, in one sentence.
          ? "Public enquiry alerts send through Resend: connect Resend in Company → Connections, then set its enquiry notification email — or a support email in Business details for it to use."
          : "Connect Resend or SMTP in Company → Connections, using a sender address verified for your own domain.",
      required: true,
      group: "communication",
      scope: "company",
      envKeys: ["RESEND_API_KEY", "MILESYMEDIA_FROM_EMAIL", "MILESYMEDIA_FROM_NAME", "MILESYMEDIA_REPLY_TO", "ENQUIRY_NOTIFY_TO", "ENQUIRY_EMAIL_FROM"],
    },
    {
      id: "uploads",
      label: "Private files",
      status: uploadsReady ? "ready" : "needs-setup",
      summary: uploadsReady ? "Customer uploads use durable object storage." : "Uploads currently depend on the local filesystem.",
      action: uploadsReady ? "No action needed." : "Configure the private Supabase upload bucket.",
      required: true,
      group: "core",
      scope: "platform",
      envKeys: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_UPLOAD_BUCKET", "BLOB_READ_WRITE_TOKEN"],
    },
    {
      id: "billing",
      label: "Stripe payments",
      status: stripeReady ? "ready" : "optional",
      summary: stripeReady
        ? `Checkout and webhook reconciliation are connected${activeClients ? `; ${billingConfigured} of ${activeClients} active clients also have a payment destination` : ""}.`
        : "Invoices can still record cash or bank transfer, but automatic card payments and subscriptions are offline.",
      action: stripeReady ? "No action needed." : "Add the Stripe secret key and webhook signing secret.",
      required: false,
      group: "money",
      scope: "company",
      envKeys: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    },
    {
      // Scoped `platform` because that is what it IS today: one env-only OAuth
      // web client for the whole deployment, with no per-company path anywhere
      // in the app. Showing a tenant a row they cannot act on would break the
      // "an action must state how it is dealt with" contract. Whether Google
      // sign-in should BECOME per-company is an open product decision
      // (env-and-sellability.md §1.4) — this classification records today's
      // implementation, it does not settle that.
      id: "google",
      label: "Google sign-in",
      status: googleReady ? "ready" : "optional",
      summary: googleReady ? "Google OAuth is available on the sign-in screen." : "Password and one-time access still work; Google sign-in is hidden.",
      action: googleReady ? "No action needed." : "Create a Google OAuth web client and add its client ID and secret.",
      required: false,
      group: "communication",
      scope: "platform",
      envKeys: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URI"],
    },
    {
      id: "github",
      label: "GitHub publishing",
      status: githubReady ? "ready" : "optional",
      summary: githubReady ? "Client projects can be published to private GitHub repositories." : "Repository creation and publishing are unavailable.",
      action: githubReady ? "No action needed." : "Add a fine-grained GitHub token and the repository owner.",
      required: false,
      group: "development",
      scope: "company",
      envKeys: ["GITHUB_TOKEN", "GITHUB_OWNER"],
    },
    {
      id: "vercel",
      label: "Vercel deployment",
      status: vercelReady ? "ready" : "optional",
      summary: vercelReady ? "Client previews and domains can be managed from Development." : "The app cannot create client preview deployments yet.",
      action: vercelReady ? "No action needed." : "Add a Vercel token and, when applicable, the team ID.",
      required: false,
      group: "development",
      scope: "company",
      envKeys: ["VERCEL_TOKEN", "VERCEL_TEAM_ID"],
    },
    {
      id: "assistant",
      label: "Built-in assistant",
      status: assistantReady ? "ready" : "optional",
      summary: assistantReady ? "The private in-app assistant can use the configured OpenAI model." : "The assistant interface remains available, but model replies are offline.",
      action: assistantReady ? "No action needed." : "Add an OpenAI Platform API key; a ChatGPT subscription is not an API credential.",
      required: false,
      group: "intelligence",
      scope: "company",
      envKeys: ["OPENAI_API_KEY", "OPENAI_ASSISTANT_MODEL"],
    },
    {
      id: "assistant-api",
      label: "External AI access",
      status: assistantApiReady ? "ready" : "optional",
      summary: assistantApiReady ? "Trusted external assistants can authenticate to the read-only business API." : "External AI tools cannot access business data.",
      action: assistantApiReady ? "Manage keys and permissions from Settings." : "Generate a private key from Settings, then connect your assistant.",
      required: false,
      group: "intelligence",
      scope: "company",
      envKeys: ["AQUACRM_ASSISTANT_API_TOKEN", "AQUACRM_ASSISTANT_AGENCY_ID"],
    },
    {
      id: "monitoring",
      label: "Error monitoring",
      status: monitoring.status,
      summary: monitoring.summary,
      action: monitoring.action,
      required: false,
      group: "development",
      scope: "platform",
      envKeys: ["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"],
    },
  ];

  // A tenant sees their own rows only, and their verdict is computed from those
  // rows alone — the whole point of the split. `envKeys` is a founder-facing
  // debugging aid naming variables a tenant cannot set, and this object is
  // serialised into the browser, so it is dropped rather than merely unrendered.
  const visibleItems = audience === "platform"
    ? items
    : items.filter(item => item.scope === "company").map(item => ({ ...item, envKeys: [] }));

  return {
    ready: visibleItems.filter(item => item.required).every(item => item.status === "ready"),
    environment: env.VERCEL_ENV === "production"
      ? "production"
      : env.VERCEL_ENV === "preview"
        ? "preview"
        : "local",
    audience,
    items: visibleItems,
  };
}
