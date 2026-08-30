import Link from "next/link";
import { ensureHydrated } from "@/server/storage";
import { getSession } from "@/lib/server/auth/auth";
import { resolvePostLoginPath } from "@/lib/server/auth/postLoginRedirect";
import { CUSTOMER_PORTAL_ROLES, type Role } from "@/server/types";

export const metadata = {
  title: "Not found · AquaCRM",
};

// A 404 must not hand you a door you cannot open. The two buttons here were
// hardcoded to "Agency dashboard" → /portal/agency and "My profile" →
// /portal/account, which is only true for an agency owner or manager: a
// client role, a freelancer or a team member following a stale link was
// offered a workspace whose host gate refuses them, and bounced again.
//
// So read the session and offer the SAME destination the post-login resolver
// would have chosen for this person. Signed out (the 404 can render before a
// session exists), fall back to sign-in rather than guessing.
const WORKSPACE_LABEL: Record<string, string> = {
  "/portal/agency": "Agency dashboard",
  "/portal/team": "Team dashboard",
  "/portal/customer": "My portal",
  "/portal/freelancer": "My workspace",
};

function workspaceLabel(href: string): string {
  return WORKSPACE_LABEL[href] ?? "My dashboard";
}

export default async function PortalNotFound() {
  let role: Role | null = null;
  let workspaceHref = "/login?next=/portal";
  try {
    await ensureHydrated();
    const session = await getSession();
    if (session) {
      role = session.role;
      workspaceHref = resolvePostLoginPath(session);
    }
  } catch {
    // No request scope / unreadable session — keep the signed-out fallback.
    role = null;
  }
  // A `lead` has a session but no portal workspace yet — the resolver returns
  // "/login" for them. Say that rather than calling them signed out.
  const hasWorkspace = role !== null && !workspaceHref.startsWith("/login");
  // The client-portal audience edits their profile inside their own portal;
  // /portal/account is the agency-side page they cannot reach.
  const inClientPortal = role !== null && (CUSTOMER_PORTAL_ROLES as readonly string[]).includes(role);
  const profileHref = inClientPortal ? "/portal/customer/account" : "/portal/account";

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-black/45">
        404
      </span>
      <h1 className="text-3xl font-semibold tracking-tight text-black/90">
        That portal page isn&apos;t here.
      </h1>
      <p className="max-w-prose text-sm text-black/55">
        {hasWorkspace
          ? "It might have been renamed, or this workspace section is not active here. Head back to your dashboard."
          : role
            ? "It might have been renamed, and your account does not have a portal workspace yet. Whoever invited you can open one."
            : "It might have been renamed, or you are signed out. Sign in and we will take you to the right place."}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {hasWorkspace ? (
          <Link
            href={workspaceHref}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/85"
          >
            {workspaceLabel(workspaceHref)}
          </Link>
        ) : role === null ? (
          // Signed out — sign-in is a door that opens. A signed-IN role with no
          // workspace (a `lead`) must NOT be sent here: /login redirects an
          // existing session back through the same resolver, which answers
          // "/login" again, so the button would be a redirect loop. They get
          // the website link below, which is the only door they actually have.
          <Link
            href="/login?next=/portal"
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/85"
          >
            Sign in
          </Link>
        ) : null}
        {hasWorkspace ? (
          <Link
            href={profileHref}
            className="rounded-md border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black/75 hover:bg-black/5"
          >
            My profile
          </Link>
        ) : null}
        <Link
          href="/"
          className="rounded-md border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black/75 hover:bg-black/5"
        >
          Back to website
        </Link>
      </div>
    </main>
  );
}
