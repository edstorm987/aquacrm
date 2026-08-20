import Link from "next/link";
import { CircleCheck, Eye, TriangleAlert } from "lucide-react";

import { getSession, getSessionAgencyIds } from "@/lib/server/auth/auth";
import { ensureHydrated } from "@/server/storage";
import { getPortalConnection } from "@/server/portalConnectionStore";
import {
  PENDING_CONNECTION_TTL_MS,
  canCompleteConnection,
  refusalMessage,
  type PortalConnection,
} from "@/lib/server/portal/portalConnections";
import { DEV_CONFIRMATION_CODE } from "@/lib/server/connectionConfirmation";
import { isDevModeEnabled } from "@/lib/server/dev/devMode";
import { getClientForAgency } from "@/server/tenants";
import { isAgencyRole } from "@/server/types";

import { ConnectFlow } from "./_ConnectFlow";

/**
 * Connecting a client's own software to their Aqua portal.
 *
 * The link that reaches here carries a connection id and nothing else. It is
 * not a credential and grants nothing — everything depends on the visitor
 * signing into Aqua themselves, with whatever their account requires. That is
 * what makes one flow work for every client instead of a bespoke integration
 * each time.
 *
 * The page is deliberately dull. Somebody arriving here has just been sent
 * from another product and needs to know whose account this is, what is being
 * connected, and that nothing has happened yet.
 */
export default async function ConnectPage({ params }: { params: Promise<{ connectionId: string }> }) {
  await ensureHydrated();
  const { connectionId } = await params;
  const session = await getSession();
  const connection = getPortalConnection(connectionId);

  // Checked before anybody is asked to sign in. Sending somebody through a
  // login form only to tell them the link was dead all along wastes the one
  // bit of effort they were willing to spend.
  const devMode = isDevModeEnabled();
  const openable = isStillOpen(connection);
  if (!openable.ok) {
    return <Refused reason={refusalMessage(openable.reason)} signedIn={Boolean(session)} />;
  }

  const previewHref = devMode
    ? `/dev?client=${encodeURIComponent(openable.connection.clientId)}`
      + `&to=${encodeURIComponent(`/connect/${connectionId}`)}`
    : null;

  // Not signed in — greeted rather than redirected. They may never have seen
  // Aqua, and a login form is a strange first thing to be shown by a product
  // you have just been sent to by another one.
  if (!session) {
    const account = getClientForAgency(openable.connection.agencyId, openable.connection.clientId);
    return (
      <Shell>
        <ConnectFlow
          connectionId={openable.connection.id}
          label={openable.connection.label}
          accountName={account?.name ?? "there"}
          signedIn={false}
          devCode={devMode ? DEV_CONFIRMATION_CODE : undefined}
          devSignInHref={previewHref ?? undefined}
        />
      </Shell>
    );
  }

  // Signed in, but as somebody else — the agency doing setup, or another
  // account entirely. Both need the sign-in screen rather than a wall: the
  // link completes on the client's account, and reaching it means signing in
  // on that account, which is exactly what the first screen is for.
  const onTheAccount = session.clientId === openable.connection.clientId;
  if (!onTheAccount) {
    const account = getClientForAgency(openable.connection.agencyId, openable.connection.clientId);
    return (
      <Shell>
        <ConnectFlow
          connectionId={openable.connection.id}
          label={openable.connection.label}
          accountName={account?.name ?? "there"}
          signedIn={false}
          signedInAs={session.email}
          devCode={devMode ? DEV_CONFIRMATION_CODE : undefined}
          devSignInHref={previewHref ?? undefined}
        />
      </Shell>
    );
  }

  const attempt = canCompleteConnection({
    connection,
    viewerClientId: session.clientId,
    viewerUserId: session.userId,
  });

  if (!attempt.ok) {
    return <Refused reason={refusalMessage(attempt.reason)} signedIn />;
  }

  const client = getClientForAgency(attempt.connection.agencyId, attempt.connection.clientId);

  // Already theirs — nothing to consent to a second time.
  if (attempt.connection.status === "active") {
    return (
      <Shell>
        <span className="grid size-11 place-items-center rounded-md bg-emerald-50 text-emerald-700">
          <CircleCheck size={20} aria-hidden />
        </span>
        <h1 className="mt-4 text-xl font-semibold text-black/85">Already connected</h1>
        <p className="mt-2 text-sm leading-6 text-black/60">
          {attempt.connection.label} is connected to your {client?.name ?? "Aqua"} account.
        </p>
        <Link href="/portal/customer" className="mt-5 inline-flex min-h-10 items-center rounded-md bg-black px-4 text-sm font-semibold text-white">
          Go to your portal
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <ConnectFlow
        connectionId={attempt.connection.id}
        label={attempt.connection.label}
        accountName={client?.name ?? "there"}
        signedIn
        email={session.email}
        devCode={devMode ? DEV_CONFIRMATION_CODE : undefined}
      />
    </Shell>
  );
}

/**
 * Whether the link is worth showing anybody, before a session is involved.
 *
 * Deliberately narrower than `canCompleteConnection`, which also decides
 * whether a given person may complete it — that question needs a session and
 * cannot be asked yet.
 */
function isStillOpen(connection: PortalConnection | undefined):
  | { ok: true; connection: PortalConnection }
  | { ok: false; reason: "unknown" | "revoked" | "expired" } {
  if (!connection) return { ok: false, reason: "unknown" };
  if (connection.status === "revoked") return { ok: false, reason: "revoked" };
  if (connection.status === "pending" && Date.now() - connection.createdAt > PENDING_CONNECTION_TTL_MS) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, connection };
}

function Refused({ reason, signedIn }: { reason: string; signedIn: boolean }) {
  return (
    <Shell>
      <span className="grid size-11 place-items-center rounded-md bg-amber-50 text-amber-700">
        <TriangleAlert size={20} aria-hidden />
      </span>
      <h1 className="mt-4 text-xl font-semibold text-black/85">This link cannot be used</h1>
      <p className="mt-2 text-sm leading-6 text-black/60">{reason}</p>
      <Link
        href={signedIn ? "/portal/customer" : "/login"}
        className="mt-5 inline-flex min-h-10 items-center rounded-md border border-black/15 px-4 text-sm font-semibold text-black/70"
      >
        {signedIn ? "Go to your portal" : "Sign in to Aqua"}
      </Link>
    </Shell>
  );
}

/**
 * The stage this all happens on.
 *
 * Deliberately more than a centred box. Somebody arrives here from another
 * product, mid-task, and the moment should feel like something is being set up
 * for them rather than like a form to be got through — so the background
 * moves, slowly, and the card sits on it rather than filling the screen.
 *
 * The motion is decorative and respects `prefers-reduced-motion`.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-[#0e1013] p-5">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <span className="aq-orb absolute -left-32 -top-40 size-[34rem] rounded-full bg-[#3d93a8] opacity-70 blur-[100px]" />
        <span className="aq-orb aq-orb-2 absolute -right-40 top-1/4 size-[30rem] rounded-full bg-[#c39241] opacity-60 blur-[110px]" />
        <span className="aq-orb aq-orb-3 absolute -bottom-20 left-1/3 size-[26rem] rounded-full bg-[#2c6a8f] opacity-65 blur-[110px]" />
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,transparent_0%,rgba(8,10,12,0.35)_55%,rgba(8,10,12,0.8)_100%)]" />
      </div>
      <section className="relative w-full max-w-[26rem] rounded-2xl border border-white/14 bg-white/[0.07] p-7 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.85)] backdrop-blur-xl">
        {children}
      </section>
    </main>
  );
}
