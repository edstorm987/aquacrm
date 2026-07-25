export type ReadinessStatus = "ready" | "needs-setup" | "optional";

export interface ReadinessItem {
  id: "database" | "security" | "email" | "uploads" | "billing" | "monitoring";
  label: string;
  status: ReadinessStatus;
  summary: string;
  action: string;
  required: boolean;
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

export function inspectProductionReadiness(
  env: NodeJS.ProcessEnv = process.env,
  context: ReadinessContext = {},
): ProductionReadiness {
  const explicitBackend = env.PORTAL_BACKEND?.trim().toLowerCase();
  const databaseReady = has(env, "DATABASE_URL")
    && (explicitBackend === "postgres" || !explicitBackend);
  const securityReady = (env.PORTAL_SESSION_SECRET?.length ?? 0) >= 32
    && env.NEXT_PUBLIC_PORTAL_SECURITY === "strict"
    && isSecurePublicOrigin(env.NEXT_PUBLIC_PORTAL_BASE_URL);
  const emailReady = has(env, "POSTMARK_SERVER_TOKEN") && has(env, "MILESYMEDIA_FROM_EMAIL");
  const uploadsReady = has(env, "BLOB_READ_WRITE_TOKEN")
    || has(env, "BLOB_STORE_ID")
    || has(env, "VERCEL_OIDC_TOKEN");
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
    },
    {
      id: "email",
      label: "Customer email",
      status: emailReady ? "ready" : "needs-setup",
      summary: emailReady ? "Transactional access and security emails can be delivered." : "Customer access links cannot be emailed yet.",
      action: emailReady ? "No action needed." : "Connect Postmark and a verified Milesymedia sender address.",
      required: true,
    },
    {
      id: "uploads",
      label: "Private files",
      status: uploadsReady ? "ready" : "needs-setup",
      summary: uploadsReady ? "Customer uploads use durable object storage." : "Uploads currently depend on the local filesystem.",
      action: uploadsReady ? "No action needed." : "Connect a private Vercel Blob store.",
      required: true,
    },
    {
      id: "billing",
      label: "Client billing",
      status: billingConfigured > 0 ? "ready" : "optional",
      summary: billingConfigured > 0
        ? `${billingConfigured} of ${activeClients} active clients have a secure payment destination.`
        : "Payment destinations are configured per client when an invoice needs paying.",
      action: "Add each client's secure payment link from their Portal editor.",
      required: false,
    },
    {
      id: "monitoring",
      label: "Error monitoring",
      status: monitoringReady ? "ready" : "optional",
      summary: monitoringReady ? "Application errors can be reported externally." : "Built-in site signals work; external application error reporting is optional.",
      action: monitoringReady ? "No action needed." : "Connect Sentry before launch for faster incident diagnosis.",
      required: false,
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
