import { redirect } from "next/navigation";

import { getSession } from "@/lib/server/auth";
import { ensureHydrated } from "@/server/storage";
import { getUserById } from "@/server/users";
import { getClientForAgency } from "@/server/tenants";

import { CustomerSetup } from "./_CustomerSetup";

/**
 * A customer's first minutes with Aqua.
 *
 * They arrive from a setup email, signed in by the link and holding no
 * password of their own. Three things have to happen before they are really
 * set up: they choose a password so they can come back without a link, they
 * are welcomed by a person rather than a dashboard, and they are shown how to
 * keep the portal one tap away.
 *
 * Kept outside the portal chrome deliberately. A sidebar and a nav bar are
 * what you want on the tenth visit, not the first.
 */
export default async function SetupPage() {
  await ensureHydrated();
  const session = await getSession();

  if (!session) redirect("/login?next=%2Fsetup");
  // Agency staff have no setup to do; sending them here would be a dead end.
  if (session.role !== "end-customer") redirect("/portal");

  const user = getUserById(session.userId);
  // Already done it — this is a link they followed again, not a first visit.
  if (user?.welcomeCompletedAt) redirect("/portal/customer");
  const client = session.clientId
    ? getClientForAgency(session.agencyId, session.clientId)
    : null;

  const metadata = (client?.metadata ?? {}) as Record<string, unknown>;
  const read = (key: string) => {
    const value = metadata[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };

  return (
    <CustomerSetup
      firstName={firstName(user?.name, session.email)}
      clientName={client?.name ?? "your account"}
      providerName={read("portalProviderName") ?? "your team"}
      // Set per client, so the welcome can be specific rather than generic.
      // Absent is fine — the section is left out rather than shown broken.
      videoUrl={read("portalWelcomeVideoUrl")}
      welcomeNote={read("portalWelcomeNote")}
      needsPassword={!user?.welcomeCompletedAt}
    />
  );
}

function firstName(name: string | undefined, email: string): string {
  const fromName = name?.trim().split(/\s+/)[0];
  if (fromName) return fromName;
  // Better than "there" when all we have is an address, and it is what most
  // people would call themselves anyway.
  const handle = email.split("@")[0]?.replace(/[._-]+/g, " ").trim().split(/\s+/)[0];
  return handle ? handle.charAt(0).toUpperCase() + handle.slice(1) : "there";
}
