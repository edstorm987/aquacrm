export type ReadinessStatus = "ready" | "needs-setup" | "optional";
export type ReadinessGroup = "core" | "communication" | "money" | "development" | "intelligence";

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
  envKeys: string[];
}

export interface ProductionReadiness {
  ready: boolean;
  environment: "local" | "preview" | "production";
  items: ReadinessItem[];
}

export interface ReadinessContext {
  activeClientCount?: number;
  billingConfiguredClientCount?: number;
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
  const explicitBackend = env.PORTAL_BACKEND?.trim().toLowerCase();
  const isPublicDeployment = env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview";
  const databaseReady = has(env, "DATABASE_URL")
    && (explicitBackend === "postgres" || !explicitBackend)
    && (!isPublicDeployment || isRemoteDatabase(env.DATABASE_URL));
  const securityReady = (env.PORTAL_SESSION_SECRET?.length ?? 0) >= 32
    && env.NEXT_PUBLIC_PORTAL_SECURITY === "strict"
    && isSecurePublicOrigin(env.NEXT_PUBLIC_PORTAL_BASE_URL);
  const vaultReady = (env.PORTAL_VAULT_ENCRYPTION_KEY?.length ?? 0) >= 32;
  const emailReady = has(env, "POSTMARK_SERVER_TOKEN") && has(env, "MILESYMEDIA_FROM_EMAIL");
  const uploadsReady = has(env, "BLOB_READ_WRITE_TOKEN")
    || has(env, "BLOB_STORE_ID")
    || has(env, "VERCEL_OIDC_TOKEN");
  const stripeReady = has(env, "STRIPE_SECRET_KEY") && has(env, "STRIPE_WEBHOOK_SECRET");
  const googleReady = has(env, "GOOGLE_OAUTH_CLIENT_ID") && has(env, "GOOGLE_OAUTH_CLIENT_SECRET");
  const githubReady = has(env, "GITHUB_TOKEN");
  const vercelReady = has(env, "VERCEL_TOKEN");
  const assistantReady = has(env, "OPENAI_API_KEY");
  const assistantApiReady = has(env, "MILESYMEDIA_ASSISTANT_API_TOKEN")
    && has(env, "MILESYMEDIA_ASSISTANT_AGENCY_ID");
  const billingConfigured = context.billingConfiguredClientCount ?? 0;
  const activeClients = context.activeClientCount ?? 0;
  const monitoringReady = has(env, "SENTRY_DSN") || has(env, "NEXT_PUBLIC_SENTRY_DSN");

  const items: ReadinessItem[] = [
    {
      id: "database",
      label: "Customer data",
      status: databaseReady ? "ready" : "needs-setup",
      summary: databaseReady ? "Durable Postgres storage selected." : "Local file storage is not safe for a live deployment.",
      action: databaseReady ? "No action needed." : "Connect Postgres and set PORTAL_BACKEND=postgres.",
      required: true,
      group: "core",
      envKeys: ["DATABASE_URL", "PORTAL_BACKEND"],
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
      envKeys: ["PORTAL_VAULT_ENCRYPTION_KEY"],
    },
    {
      id: "email",
      label: "Customer email",
      status: emailReady ? "ready" : "needs-setup",
      summary: emailReady ? "Transactional access and security emails can be delivered." : "Customer access links cannot be emailed yet.",
      action: emailReady ? "No action needed." : "Connect Postmark and a verified Milesymedia sender address.",
      required: true,
      group: "communication",
      envKeys: ["POSTMARK_SERVER_TOKEN", "MILESYMEDIA_FROM_EMAIL", "MILESYMEDIA_FROM_NAME", "MILESYMEDIA_REPLY_TO"],
    },
    {
      id: "uploads",
      label: "Private files",
      status: uploadsReady ? "ready" : "needs-setup",
      summary: uploadsReady ? "Customer uploads use durable object storage." : "Uploads currently depend on the local filesystem.",
      action: uploadsReady ? "No action needed." : "Connect a private Vercel Blob store.",
      required: true,
      group: "core",
      envKeys: ["BLOB_READ_WRITE_TOKEN"],
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
      envKeys: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    },
    {
      id: "google",
      label: "Google sign-in",
      status: googleReady ? "ready" : "optional",
      summary: googleReady ? "Google OAuth is available on the sign-in screen." : "Password and one-time access still work; Google sign-in is hidden.",
      action: googleReady ? "No action needed." : "Create a Google OAuth web client and add its client ID and secret.",
      required: false,
      group: "communication",
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
      envKeys: ["OPENAI_API_KEY", "OPENAI_ASSISTANT_MODEL"],
    },
    {
      id: "assistant-api",
      label: "External AI access",
      status: assistantApiReady ? "ready" : "optional",
      summary: assistantApiReady ? "Trusted external assistants can authenticate to the read-only business API." : "External AI tools cannot access business data.",
      action: assistantApiReady ? "Manage allowed access from Launch settings." : "Generate a dedicated bearer token and set the Milesymedia agency ID.",
      required: false,
      group: "intelligence",
      envKeys: ["MILESYMEDIA_ASSISTANT_API_TOKEN", "MILESYMEDIA_ASSISTANT_AGENCY_ID"],
    },
    {
      id: "monitoring",
      label: "Error monitoring",
      status: monitoringReady ? "ready" : "optional",
      summary: monitoringReady ? "Application errors can be reported externally." : "Built-in site signals work; external application error reporting is optional.",
      action: monitoringReady ? "No action needed." : "Connect Sentry before launch for faster incident diagnosis.",
      required: false,
      group: "development",
      envKeys: ["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"],
    },
  ];

  return {
    ready: items.filter(item => item.required).every(item => item.status === "ready"),
    environment: env.VERCEL_ENV === "production"
      ? "production"
      : env.VERCEL_ENV === "preview"
        ? "preview"
        : "local",
    items,
  };
}
