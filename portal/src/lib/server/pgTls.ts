// Postgres TLS policy — fail closed (assume-breach containment, 2026-09-08).
//
// Both database connectors (storagePostgres pool + databaseStorageHealth's
// external probe) used `ssl: { rejectUnauthorized: false }` for every non-local
// connection: TLS with certificate verification OFF, i.e. trivially
// man-in-the-middleable database traffic carrying every tenant's state and the
// database password. The old comment reasoned "DATABASE_URL is a private
// secret pinned to a known provider" — but the certificate check is exactly
// what makes the pin real.
//
// Policy, in order:
//   • localhost / 127.0.0.1 / sslmode=disable    → no TLS (unchanged).
//   • production                                  → VERIFIED TLS, always.
//     `PORTAL_PG_CA_CERT` (PEM contents) supplies a provider CA when the
//     server cert does not chain to a public root (e.g. Supabase direct
//     connections). The insecure escape hatch is IGNORED in production —
//     setting it changes nothing except a loud warning.
//   • development/test                            → verified TLS by default;
//     `PORTAL_PG_ALLOW_INSECURE_TLS=1` is an explicit, non-production-only
//     escape hatch for lab databases with self-signed certs.
//
// Pure and injectable so the regression suite proves every branch, including
// that production ignores the escape hatch.

export interface PgTlsDecision {
  ssl: false | { rejectUnauthorized: true; ca?: string } | { rejectUnauthorized: false };
  warning?: string;
}

export function resolvePgTls(
  connectionString: string,
  env: NodeJS.ProcessEnv = process.env,
): PgTlsDecision {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    // Unparseable URL: connecting will fail anyway; demand verification.
    return { ssl: { rejectUnauthorized: true } };
  }
  const sslmode = url.searchParams.get("sslmode");
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const wantsTls = (sslmode !== null && sslmode !== "disable") || (sslmode === null && !isLocal);
  if (!wantsTls) return { ssl: false };

  const isProduction = env.NODE_ENV === "production";
  const ca = env.PORTAL_PG_CA_CERT?.trim() || undefined;
  const insecureRequested = env.PORTAL_PG_ALLOW_INSECURE_TLS === "1";

  if (isProduction) {
    return {
      ssl: ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true },
      warning: insecureRequested
        ? "[pg-tls] PORTAL_PG_ALLOW_INSECURE_TLS is set but IGNORED in production — certificate verification stays on."
        : undefined,
    };
  }

  if (insecureRequested) {
    return {
      ssl: { rejectUnauthorized: false },
      warning: "[pg-tls] certificate verification DISABLED by PORTAL_PG_ALLOW_INSECURE_TLS (non-production only).",
    };
  }
  return { ssl: ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true } };
}
