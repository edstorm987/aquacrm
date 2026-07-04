// /portal/customer — end-customer home, variant-driven.
//
// Resolution order:
//   1. The website-editor install for (agencyId, clientId). When
//      missing → fallback render.
//   2. `getActivePortalVariant(siteId, "account")` — the variant the
//      client has activated for the account surface. Falls back to
//      `"login"` (Round 5 lift: many clients won't have an account
//      variant yet but they *do* have a login variant from
//      `applyStarterVariant`).
//   3. When both are missing → small "Welcome" card with links to
//      every customer-panel plugin item the client has installed.
//
// The active variant's blocks render through T3's `<BlockRenderer>`
// (a client component). The chrome — sidebar, brand-kit injection —
// is painted by `/portal/customer/layout.tsx` one layer up.

import Link from "next/link";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { getClientForAgency } from "@/server/tenants";
import { getInstall, listInstalledFor } from "@/server/pluginInstalls";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { listPlugins } from "@/plugins/_registry";
import { navItemAllowedRoles } from "@/plugins/_types";
import {
  getActivePortalVariant,
  getOrCreateDefaultSite,
} from "@aqua/plugin-website-editor/server";
import type { PluginStorage as T3PluginStorage } from "@aqua/plugin-website-editor/types";
import { BlockRenderer } from "@aqua/plugin-website-editor/components";

const WEBSITE_EDITOR_PLUGIN_ID = "website-editor";

export default async function CustomerHome() {
  await ensureHydrated();
  const session = await requireRole("end-customer");
  if (!session.clientId) {
    return (
      <FallbackCard
        heading="Account scope missing"
        body="Your session isn't tied to a client. Contact support."
      />
    );
  }

  const client = getClientForAgency(session.agencyId, session.clientId);
  if (!client) {
    return (
      <FallbackCard
        heading="Account closed"
        body="This client portal is no longer active."
      />
    );
  }

  // Try to resolve an active variant via the website-editor plugin.
  let variantPage: { id: string; title: string; blocks: unknown[]; themeId?: string } | null = null;
  let variantRole: "account" | "login" | null = null;

  const install = getInstall(
    { agencyId: session.agencyId, clientId: session.clientId },
    WEBSITE_EDITOR_PLUGIN_ID,
  );
  if (install?.enabled) {
    const storage = makePluginStorage(install.id) as T3PluginStorage;
    try {
      const site = await getOrCreateDefaultSite(
        storage,
        session.agencyId,
        session.clientId,
        client.slug,
      );
      const account = await getActivePortalVariant(
        storage,
        session.agencyId,
        session.clientId,
        site.id,
        "account",
      );
      if (account) {
        variantPage = account;
        variantRole = "account";
      } else {
        const login = await getActivePortalVariant(
          storage,
          session.agencyId,
          session.clientId,
          site.id,
          "login",
        );
        if (login) {
          variantPage = login;
          variantRole = "login";
        }
      }
    } catch {
      // Soft fail — fallback render is the safety net.
    }
  }

  const customerPluginLinks = collectCustomerPluginLinks({
    role: session.role,
    installs: listInstalledFor({ agencyId: session.agencyId, clientId: session.clientId }),
  });

  const displayName = (session.email.split("@")[0] ?? "there").replace(/[._-]+/g, " ");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-black/50">{client.name}</span>
        <h1 className="text-2xl font-semibold tracking-tight text-black/90">
          Welcome back, {displayName}.
        </h1>
        <p className="text-sm text-black/60">
          {variantPage
            ? `Showing ${variantRole === "account" ? "your account" : "the login"} variant of ${client.name}.`
            : "This is your account home — you'll see more here as your client adds features."}
        </p>
      </header>

      {variantPage && (
        <section
          aria-label={`${variantRole} variant`}
          className="rounded-lg border border-black/10 bg-white p-4"
        >
          <div className="mb-3 flex items-center justify-between text-xs text-black/50">
            <span>
              <strong className="font-medium text-black/70">{variantPage.title}</strong>
              {variantRole === "login" && " · login variant (account variant not yet active)"}
            </span>
          </div>
          <BlockRenderer blocks={variantPage.blocks as never} themeId={variantPage.themeId} />
        </section>
      )}

      {customerPluginLinks.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-black/60">
            Things you can do
          </h2>
          <ul className="grid gap-2 md:grid-cols-2">
            {customerPluginLinks.map(link => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="block rounded-lg border border-black/10 bg-white p-3 text-sm text-black/80 transition hover:shadow"
                >
                  <span className="font-medium">{link.label}</span>
                  {link.pluginName && (
                    <span className="ml-2 text-[11px] text-black/45">{link.pluginName}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!variantPage && customerPluginLinks.length === 0 && (
        <FallbackCard
          heading="Nothing here yet"
          body={`When ${client.name} activates a portal variant for your account or installs a plugin that targets the customer surface, it'll show up here.`}
        />
      )}
    </div>
  );
}

function FallbackCard({ heading, body }: { heading: string; body: string }) {
  return (
    <div role="status" className="rounded-lg border border-dashed border-black/15 bg-white/60 p-6">
      <h1 className="text-lg font-semibold tracking-tight text-black/90">{heading}</h1>
      <p className="mt-1 text-sm text-black/60">{body}</p>
    </div>
  );
}

interface CustomerLink {
  href: string;
  label: string;
  pluginName?: string;
}

// Walk the registry + installs, return every nav item a customer-tier
// plugin contributed under `panelId: "customer"` or with an href
// anchored at `/portal/customer/...`. Same role/feature gate as the
// sidebar uses.
function collectCustomerPluginLinks(input: {
  role: import("@/server/types").Role;
  installs: import("@/server/types").PluginInstall[];
}): CustomerLink[] {
  const enabled = new Map(input.installs.filter(i => i.enabled).map(i => [i.pluginId, i] as const));
  const links: CustomerLink[] = [];
  for (const plugin of listPlugins()) {
    const install = enabled.get(plugin.id);
    if (!install) continue;
    for (const navItem of plugin.navItems) {
      const isCustomer = navItem.panelId === "customer" || navItem.href.startsWith("/portal/customer");
      if (!isCustomer) continue;
      const allowed = navItemAllowedRoles(navItem);
      if (allowed && !allowed.includes(input.role)) continue;
      if (navItem.requiresFeature && !install.features[navItem.requiresFeature]) continue;
      links.push({
        href: navItem.href,
        label: navItem.label,
        pluginName: plugin.name,
      });
    }
  }
  return links.sort((a, b) => a.label.localeCompare(b.label));
}
