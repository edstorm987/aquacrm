import { createHash } from "node:crypto";

import type { ReactNode } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Cable, Database, KeyRound, Plug, Radio, TriangleAlert } from "lucide-react";

import { requireRole } from "@/lib/server/auth/auth";
import { AGENCY_ROLES } from "@/server/types";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import { ensureHydrated, flushPendingWrites, getBackendInfo, getState } from "@/server/storage";
import { listClients } from "@/server/tenants";
import {
  ensureAgencyMasterSiteKey,
  listWebsiteSources,
  masterTagSnippet,
} from "@/server/websiteSources";
import { INJECTION_PROVIDERS } from "@/server/websiteInjections";
import { connectionLinkOrigin } from "@/lib/server/portal/portalConnections";
import { isPubliclyReachableOrigin } from "@/lib/public/publicOrigin";
import { INTEGRATION_CATALOG, type IntegrationProvider } from "@/lib/integrations/catalog";
import {
  EXTERNAL_ASSISTANT_MODULES,
  isExternalAssistantModule,
  type ExternalAssistantAuth,
  type ExternalAssistantModule,
} from "@/lib/server/assistants/externalAssistantApi";
import {
  EXTERNAL_ASSISTANT_PERMISSIONS,
  listExternalAssistantApiKeys,
  type ExternalAssistantApiKeySummary,
} from "@/lib/server/assistants/externalAssistantKeys";
import {
  handleExternalAssistantMcpRequest,
  listExternalAssistantMcpTools,
} from "@/lib/server/assistants/externalAssistantMcp";
import { ExternalAiConnectionPanel } from "@/app/portal/agency/settings/ExternalAiConnectionPanel";
import { IntegrationConnectionsPanel } from "@/app/portal/agency/settings/IntegrationConnectionsPanel";
import { PageHeader, Panel, Pill } from "../_ui";
import { McpConnectPanel, type McpConnectView, type McpKeyView } from "./_McpConnectPanel";
import { MasterTagPanel, type MasterTagView } from "./_MasterTagPanel";

// "API & MCP" — the Dev Team view of the machine-facing surfaces that already
// ship. Three of them, each with its own credential:
//   1. managed `aqa_` keys → the MCP server (`/api/mcp`) + REST (`/api/v1`)
//   2. the encrypted provider vault (outbound credentials we hold)
//   3. the master Aqua Tag → a permanent site key living on other people's
//      websites, calling three public endpoints inbound.
//
// Nothing here is a second implementation. The two working panels are mounted
// straight from `agency/settings/` (IntegrationConnectionsPanel is already
// dual-mounted by inbox + company), and the MCP block is DERIVED from the live
// code — `initialize` for the negotiated protocol version, and
// `listExternalAssistantMcpTools()` per key for the real tool list. Nothing is
// restated by hand, so this page cannot drift from the server it describes.
//
// GATE: identical to every sibling — the layout AND this page re-assert
// `devDocsAccessible` (founder-only Dev Team access). Note that `ExternalAiConnectionPanel`
// talks to `/api/portal/settings/external-ai`, which is gated to
// owner/manager. That is deliberately NOT wrapped: `devDocsAccessible` requires
// `effectiveRole(session).isFounder`, which only `agency-owner` ever gets, so
// this page's gate is strictly NARROWER than the endpoint's. A Dev-Team-scoped
// wrapper would add a second permission surface to keep in sync and buy nothing.

type PageSearchParams = Promise<Record<string, string | string[] | undefined>>;

// Published MCP protocol revisions we ask the live server about. The answer is
// the SERVER's — `initialize` echoes a requested version only when it is
// genuinely supported and otherwise falls back to its latest — so this list is
// only the set of questions, never the set of answers.
const PROBE_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

export async function ApiSection({ tabs, searchParams }: { tabs?: ReactNode; searchParams: PageSearchParams }) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }
  if (!devDocsAccessible(session)) notFound();

  const query = await searchParams;
  const initialProvider = integrationProvider(singleValue(query.integration));

  const clients = listClients(session.agencyId).map(client => ({ id: client.id, name: client.name }));
  const canManage = session.role === "agency-owner" || session.role === "agency-manager";
  const backend = getBackendInfo();

  const keys = listExternalAssistantApiKeys(session.agencyId);
  const managedActiveKeys = keys.filter(key => key.status === "active");
  // The legacy environment token is a LIVE, authenticating, full-scope
  // credential for the very MCP server this page describes — and it is not a
  // managed key, so it used to contribute nothing to either header pill. With
  // no managed keys created, the page said "0 active keys · 0 granted tools"
  // while a bearer request with that token authenticated and got the full tool
  // list. The inverse is worse: revoking the last managed key to lock the
  // workspace down showed 0/0 and looked locked while the env key kept working.
  const legacyKey = legacyEnvKey(session.agencyId);
  const activeKeyCount = managedActiveKeys.length + (legacyKey ? 1 : 0);

  // Same derivation as `externalAssistantSetup.ts`'s `resolvedMcpUrl`: the API
  // base with `/api/v1` stripped, plus `/api/mcp`.
  const origin = await requestOrigin();
  const apiBaseUrl = `${origin}/api/v1`;
  const mcpUrl = `${apiBaseUrl.replace(/\/api\/v1\/?$/, "")}/api/mcp`;
  const openApiUrl = `${origin}/api/v1/openapi.json`;

  const handshake = await negotiate(authFor(session.agencyId, keys[0]), undefined);
  const supported: string[] = [];
  for (const candidate of PROBE_PROTOCOL_VERSIONS) {
    const echoed = await negotiate(authFor(session.agencyId, keys[0]), candidate);
    if (echoed?.protocolVersion === candidate) supported.push(candidate);
  }

  // The master tag. `ensureAgencyMasterSiteKey` is idempotent — it mints the
  // key on first ask and then returns it forever (it must never rotate: the
  // tag is already deployed inside other people's sites).
  const tagKey = ensureAgencyMasterSiteKey(session.agencyId);
  await flushPendingWrites();
  const tagOrigin = connectionLinkOrigin(origin);
  const masterTag: MasterTagView = {
    siteKey: tagKey,
    snippet: masterTagSnippet(tagOrigin, tagKey),
    scriptUrl: `${tagOrigin.replace(/\/+$/, "")}/aqua-tag.js`,
    configUrl: `${tagOrigin.replace(/\/+$/, "")}/api/public/aqua-tag-config`,
    formCaptureUrl: `${tagOrigin.replace(/\/+$/, "")}/api/public/form-capture`,
    telemetryUrl: `${tagOrigin.replace(/\/+$/, "")}/api/telemetry/collect`,
    origin: tagOrigin,
    // Caught in browser verification: checking whether NEXT_PUBLIC_PORTAL_BASE_URL
    // is *set* is the wrong question — locally it IS set, to localhost:3032, so
    // the warning stayed silent precisely when the snippet carried a dev origin.
    // What matters is whether the resolved origin is reachable from the open
    // internet, wherever it came from.
    originIsFallback: !isPubliclyReachableOrigin(tagOrigin),
    providers: INJECTION_PROVIDERS.map(provider => ({
      kind: provider.kind,
      label: provider.label,
      valueLabel: provider.valueLabel,
      // RegExp is not serialisable across the server/client boundary.
      valuePattern: provider.valuePattern.source,
      defaultConsentCategory: provider.defaultConsentCategory,
    })),
    taggedSiteCount: listWebsiteSources(session.agencyId).length,
  };

  const view: McpConnectView = {
    origin,
    apiBaseUrl,
    openApiUrl,
    mcpUrl,
    protocolVersion: handshake?.protocolVersion ?? "unavailable",
    supportedProtocolVersions: supported,
    serverName: handshake?.serverInfo?.name ?? "aquacrm-business-assistant",
    serverTitle: handshake?.serverInfo?.title ?? "",
    serverVersion: handshake?.serverInfo?.version ?? "",
    instructions: handshake?.instructions ?? "",
    workspace: session.agencyId,
    // The environment credential leads: it is the one nobody created and nobody
    // can revoke from here, and it authenticates whether or not managed keys
    // exist.
    keys: [
      ...(legacyKey ? [legacyKey] : []),
      ...keys.map<McpKeyView>(key => ({
        id: key.id,
        name: key.name,
        tokenPrefix: key.tokenPrefix,
        fingerprint: key.fingerprint,
        status: key.status,
        modules: key.modules,
        permissions: key.permissions,
        createdAt: key.createdAt,
        lastUsedAt: key.lastUsedAt,
        expiresAt: key.expiresAt,
        // The real thing: what `tools/list` returns for THIS key's scope.
        tools: mcpToolViews(authFor(session.agencyId, key)),
      })),
    ],
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        icon={<Plug size={20} />}
        title="API & MCP"
        subtitle="The machine-facing side of AquaCRM — API keys, the MCP server, the REST gateway, the master tag and the provider vault."
        meta={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            {tabs}
            <Pill tone={activeKeyCount > 0 ? "ok" : "muted"}>
              {activeKeyCount} active key{activeKeyCount === 1 ? "" : "s"}
            </Pill>
            {legacyKey ? <Pill tone="warn"><TriangleAlert size={11} /> 1 from the environment</Pill> : null}
            <Pill tone="accent">
              {view.keys
                .filter(key => key.status === "active")
                .reduce((sum, key) => sum + key.tools.length, 0)} granted tools
            </Pill>
          </div>
        )}
      />

      <Panel
        title="Where these keys live"
        hint="Read this before you rely on a key surviving anything"
        right={<Pill tone="warn"><TriangleAlert size={11} /> Not a Supabase table</Pill>}
      >
        <div className="flex items-start gap-3">
          <span aria-hidden className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[color:var(--dev-warning-soft)] text-[color:var(--dev-warning)]">
            <Database size={15} />
          </span>
          <div className="text-sm leading-6 text-[color:var(--dt-muted)]">
            <p>
              External-AI keys are stored in <strong className="text-[color:var(--dt-ink)]">PortalState</strong> —
              the portal&apos;s single state blob — not in a dedicated Supabase table. This server&apos;s backend is{" "}
              <code className="rounded bg-[color:var(--dt-hairline)] px-1 py-0.5 text-xs text-[color:var(--dt-ink)]">{backend.kind}</code>{" "}
              ({backend.description}), {backend.persistent ? "which persists across restarts" : "which does NOT persist across restarts"}.
            </p>
            <p className="mt-2">
              On the <strong className="text-[color:var(--dt-ink)]">file</strong> backend that blob is a JSON file under{" "}
              <code className="rounded bg-[color:var(--dt-hairline)] px-1 py-0.5 text-xs text-[color:var(--dt-ink)]">.data/</code>, so{" "}
              <strong className="text-[color:var(--dt-ink)]">resetting, re-seeding or re-forking the sandbox destroys every key here</strong> —
              and every assistant configured with one silently loses access. Only the SHA-256 hash is kept, so a lost key
              cannot be recovered: it has to be created again and re-pasted into the assistant.
            </p>
            <p className="mt-2">
              <strong className="text-[color:var(--dt-ink)]">The master tag&apos;s site key has the same problem, and worse.</strong>{" "}
              It lives in <code className="rounded bg-[color:var(--dt-hairline)] px-1 py-0.5 text-xs text-[color:var(--dt-ink)]">agencyMasterTagKeys</code>{" "}
              on the same blob — but that key is already pasted into deployed websites we don&apos;t control. Losing it
              doesn&apos;t just break a connection you can re-make: every tag still running out there starts sending a
              key this workspace no longer recognises, and their form captures and telemetry stop resolving to an agency.
            </p>
            <p className="mt-2 text-xs text-[color:var(--dt-faint)]">
              Flagged, not fixed — moving key storage out of PortalState is Ed&apos;s call, not a worker&apos;s.
            </p>
          </div>
        </div>
      </Panel>

      <Panel title="External AI access" hint="Managed aqa_ keys — create, reveal once, rotate, revoke">
        <ExternalAiConnectionPanel />
      </Panel>

      <Panel title="Connect an MCP client" hint="Live from the running server — not a written-down copy">
        <McpConnectPanel view={view} />
      </Panel>

      <Panel
        title="Master Aqua Tag"
        hint="The one script on every site — its key, its endpoints, and what it may inject"
        right={<Pill tone="accent"><Radio size={11} /> {masterTag.providers.length} injectable tools</Pill>}
      >
        <MasterTagPanel view={masterTag} />
      </Panel>

      <Panel
        title="Provider credentials"
        hint="The AES-256-GCM vault behind email, SMS, payments, hosting and AI"
        right={<Pill tone="muted"><KeyRound size={11} /> {INTEGRATION_CATALOG.length} providers</Pill>}
      >
        <IntegrationConnectionsPanel clients={clients} canManage={canManage} initialProvider={initialProvider} />
      </Panel>

      <p className="flex items-center gap-1.5 text-[11px] text-[color:var(--dt-faint)]">
        <Cable size={12} />
        The AI + vault panels ship in <code className="text-[color:var(--dt-faint)]">/portal/agency/settings</code> and{" "}
        <code className="text-[color:var(--dt-faint)]">/portal/agency/company?view=connections</code>; the tag&apos;s guided setup
        (detect · scan forms · route a site · configure injections) lives in{" "}
        <code className="text-[color:var(--dt-faint)]">/portal/agency/fulfilment?view=tags</code>. This page is a second view of the
        machine surface, not a second copy of the workflows.
      </p>
    </div>
  );
}

// ---- helpers ---------------------------------------------------------------

interface McpHandshake {
  protocolVersion?: string;
  serverInfo?: { name?: string; title?: string; version?: string };
  instructions?: string;
}

/**
 * Ask the real MCP handler to negotiate. `initialize` reads no state and
 * touches no key — it is the honest way to read the protocol version and
 * server identity without exporting internals from `externalAssistantMcp.ts`.
 */
async function negotiate(auth: ExternalAssistantAuth, protocolVersion?: string): Promise<McpHandshake | null> {
  const response = await handleExternalAssistantMcpRequest(auth, {
    jsonrpc: "2.0",
    id: "dev-team-api-page",
    method: "initialize",
    params: protocolVersion ? { protocolVersion } : {},
  }) as { result?: McpHandshake } | null;
  return response?.result ?? null;
}

/**
 * The legacy environment token, described as the credential it actually is —
 * or `null` when it is not live for THIS workspace.
 *
 * The three conditions are the ones `/api/portal/settings/external-ai` already
 * computes for its own status block: a token is set, its agency id is this
 * session's agency, and that agency exists. The scope is
 * `authenticateExternalAssistant`'s own fallback for an unmanaged token — every
 * module, and every permission except `actions:propose` — so the tool list
 * below is the real one a bearer request receives, not a description of it.
 */
function legacyEnvKey(sessionAgencyId: string): McpKeyView | null {
  const token = process.env.AQUACRM_ASSISTANT_API_TOKEN?.trim()
    || process.env.MILESYMEDIA_ASSISTANT_API_TOKEN?.trim()
    || "";
  const agencyId = process.env.AQUACRM_ASSISTANT_AGENCY_ID?.trim()
    || process.env.MILESYMEDIA_ASSISTANT_AGENCY_ID?.trim()
    || "milesymedia";
  if (!token || agencyId !== sessionAgencyId || !getState().agencies[agencyId]) return null;

  const auth: ExternalAssistantAuth = {
    agencyId,
    // The same fingerprint the authenticator computes for an unmanaged token,
    // so the value on screen matches the one in the activity log.
    tokenFingerprint: createHash("sha256").update(token).digest("hex").slice(0, 16),
    keyName: "Legacy environment key",
    modules: [...EXTERNAL_ASSISTANT_MODULES],
    permissions: EXTERNAL_ASSISTANT_PERMISSIONS.filter(permission => permission !== "actions:propose"),
    managed: false,
  };
  return {
    id: "legacy-env",
    name: "Legacy environment key",
    tokenPrefix: "env",
    fingerprint: auth.tokenFingerprint,
    // It authenticates right now. Anything softer than "active" would repeat
    // the dishonesty this row exists to fix.
    status: "active",
    modules: [...auth.modules],
    permissions: [...auth.permissions],
    createdAt: 0,
    unmanaged: true,
    tools: mcpToolViews(auth),
  };
}

/** The live `tools/list` for one scope, in the panel's shape. */
function mcpToolViews(auth: ExternalAssistantAuth): McpKeyView["tools"] {
  return listExternalAssistantMcpTools(auth).map(tool => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    readOnly: tool.annotations.readOnlyHint,
  }));
}

/**
 * The auth a bearer request with this key would produce. Built from the stored
 * summary (the plaintext token is unrecoverable by design) — read-only input to
 * `listExternalAssistantMcpTools`, which reads only modules + permissions.
 */
function authFor(agencyId: string, key?: ExternalAssistantApiKeySummary): ExternalAssistantAuth {
  return {
    agencyId,
    tokenFingerprint: key?.fingerprint ?? "",
    keyId: key?.id,
    keyName: key?.name ?? "",
    modules: (key?.modules ?? []).filter(isExternalAssistantModule) as ExternalAssistantModule[],
    permissions: key?.permissions ?? [],
    managed: true,
  };
}

/** The absolute origin of this request — the base every published URL hangs off. */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto")
    ?? (/^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

function singleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function integrationProvider(value: string | undefined): IntegrationProvider | undefined {
  return INTEGRATION_CATALOG.some(item => item.id === value) ? value as IntegrationProvider : undefined;
}
