import { NextResponse } from "next/server";

// A person's own sidebar arrangement and saved tabs.
//
// ── Why this has no capability gate ───────────────────────────────────────
//
// Every other portal route asks the access kernel what the caller may do,
// because every other route touches the business's data. This one touches only
// the caller's own chrome: which order their nav rows sit in, and which
// shortcuts they made for themselves. Ed's ask was *"anyone"*, and the kernel
// has nothing to say about it — there is no capability for "may arrange your
// own sidebar", and inventing one would mean an owner could stop somebody
// moving a row on their own screen.
//
// What replaces the gate is that the caller cannot address anything but
// themselves. `agencyId` and `userId` come from the SESSION and are never read
// from the body — the record key is `${agencyId}|${userId}`, so a body-supplied
// id would be a straightforward cross-tenant write. That is the whole security
// property here, and it is why the ids are taken before the body is parsed.
//
// A saved tab's href is refused unless it is an in-app absolute path
// (`normaliseSavedTab`), because the value comes back as something the person
// clicks.

import { authErrorResponse, getSession } from "@/lib/server/auth/auth";
import {
  getUserChromeLayout,
  resetUserChromeOrder,
  saveUserChromeLayout,
} from "@/lib/server/chrome/userChromeLayout";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import type { UserChromeLayout } from "@/server/types";

async function requireSelf(): Promise<{ agencyId: string; userId: string }> {
  const session = await getSession();
  if (!session) throw new Response(null, { status: 401 });
  return { agencyId: session.agencyId, userId: session.userId };
}

function unauthorised(): NextResponse {
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

export async function GET() {
  try {
    await ensureHydrated();
    const session = await getSession();
    if (!session) return unauthorised();
    return NextResponse.json({ ok: true, layout: getUserChromeLayout(session.agencyId, session.userId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    await ensureHydrated();
    const who = await requireSelf().catch(() => null);
    if (!who) return unauthorised();

    const body = await request.json().catch(() => null) as Partial<UserChromeLayout> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "A layout is required." }, { status: 400 });
    }

    // A whole-record save: a single drop can change the panel order, the item
    // order in two panels and a tab's placement at once, and three sequential
    // patches would leave the nav briefly describing an arrangement nobody
    // chose. Everything is normalised on the way in.
    //
    // ── Absent means "leave it", empty means "clear it" ───────────────────
    //
    // Added 2026-08-29 with topbar control pins. Two independent clients now
    // write this record — the sidebar/saved-tabs store and the topbar pin
    // sheet — and neither knows about the other's field. Under the previous
    // "absent is empty" reading, saving a tab would have silently cleared the
    // pins and pinning a control would have silently cleared the sidebar
    // arrangement. Presence is the signal instead, which leaves the dragging
    // client exactly as it was: it always sends all three of its fields, and a
    // deliberate clear still arrives as a present, empty array.
    const current = getUserChromeLayout(who.agencyId, who.userId);
    const layout = saveUserChromeLayout(who.agencyId, who.userId, {
      panelOrder: Array.isArray(body.panelOrder) ? body.panelOrder : current.panelOrder,
      itemOrder: body.itemOrder && typeof body.itemOrder === "object" ? body.itemOrder : current.itemOrder,
      savedTabs: Array.isArray(body.savedTabs) ? body.savedTabs : current.savedTabs,
      topbarControls: Array.isArray(body.topbarControls) ? body.topbarControls : current.topbarControls,
    });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, layout });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Put the sidebar back the way it ships. Saved tabs survive — they are not an arrangement. */
export async function DELETE() {
  try {
    await ensureHydrated();
    const who = await requireSelf().catch(() => null);
    if (!who) return unauthorised();
    const layout = resetUserChromeOrder(who.agencyId, who.userId);
    await flushPendingWrites();
    return NextResponse.json({ ok: true, layout });
  } catch (error) {
    return authErrorResponse(error);
  }
}
