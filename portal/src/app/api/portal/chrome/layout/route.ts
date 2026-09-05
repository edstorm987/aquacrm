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
  normaliseLayout,
  resetUserChromeOrder,
  saveUserChromeLayout,
  userChromeLayoutLockKey,
} from "@/lib/server/chrome/userChromeLayout";
import { ProductWorkspaceBusyError, withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";
import { ensureHydrated } from "@/server/storage";
import type { UserChromeLayout } from "@/server/types";

type LayoutWrite = Partial<UserChromeLayout> & { expectedUpdatedAt?: unknown };
const PRIVATE_NO_STORE = { "cache-control": "private, no-store" };

function expectedRevision(body: LayoutWrite): number | null | "invalid" {
  if (!("expectedUpdatedAt" in body)) return null;
  return typeof body.expectedUpdatedAt === "number"
    && Number.isFinite(body.expectedUpdatedAt)
    && body.expectedUpdatedAt >= 0
    ? body.expectedUpdatedAt
    : "invalid";
}

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
    return NextResponse.json(
      { ok: true, layout: getUserChromeLayout(session.agencyId, session.userId) },
      { headers: PRIVATE_NO_STORE },
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    await ensureHydrated();
    const who = await requireSelf().catch(() => null);
    if (!who) return unauthorised();

    const body = await request.json().catch(() => null) as LayoutWrite | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "A layout is required." }, { status: 400 });
    }
    const expectedUpdatedAt = expectedRevision(body);
    if (expectedUpdatedAt === "invalid") {
      return NextResponse.json({ ok: false, error: "expectedUpdatedAt must be a non-negative number." }, { status: 400 });
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
    const outcome = await withPortalStateTransaction(
      userChromeLayoutLockKey(who.agencyId, who.userId),
      () => {
        // Read while holding the account lane. Reading before the transaction
        // lets two requests snapshot the same record and silently replace one
        // another even if the writes themselves are atomic.
        const current = getUserChromeLayout(who.agencyId, who.userId);
        if (expectedUpdatedAt !== null && expectedUpdatedAt !== current.updatedAt) {
          return { kind: "conflict" as const, layout: current };
        }

        const savedTools = Array.isArray(body.savedTools)
          ? normaliseLayout({
            ...current,
            savedToolFolders: Array.isArray(body.savedToolFolders) ? body.savedToolFolders : current.savedToolFolders,
            savedTools: body.savedTools.map(tool => {
              const canonicalId = typeof tool?.id === "string" ? tool.id.trim() : "";
              return {
                ...tool,
                // Storage identity is server-owned. Compare the same canonical id
                // normalisation uses below; otherwise `" tool_a "` would retain the
                // card while silently dropping its only private-file pointer.
                iconAsset: current.savedTools.find(candidate => candidate.id === canonicalId)?.iconAsset,
              };
            }),
          }, who.agencyId, who.userId).savedTools
          : current.savedTools;
        if (Array.isArray(body.savedTools)) {
          // Compare with the canonical proposal, not raw ids. A malformed row can
          // carry a real id and then be dropped by normalisation; trusting the raw
          // id here would let that drop orphan its attached private file.
          const requestedIds = new Set(savedTools.map(tool => tool.id));
          if (current.savedTools.some(tool => tool.iconAsset && !requestedIds.has(tool.id))) {
            return { kind: "icon-attached" as const, layout: current };
          }
        }
        const layout = saveUserChromeLayout(who.agencyId, who.userId, {
          panelOrder: Array.isArray(body.panelOrder) ? body.panelOrder : current.panelOrder,
          itemOrder: body.itemOrder && typeof body.itemOrder === "object" ? body.itemOrder : current.itemOrder,
          savedTabs: Array.isArray(body.savedTabs) ? body.savedTabs : current.savedTabs,
          // Same presence rule: the palette client always sends this field; the
          // sidebar and pin clients never do, and must not clear it.
          savedTools,
          // Folder definitions travel beside the cards. Older chrome clients do
          // not know this field, so omission must preserve them rather than clear.
          savedToolFolders: Array.isArray(body.savedToolFolders) ? body.savedToolFolders : current.savedToolFolders,
          topbarControls: Array.isArray(body.topbarControls) ? body.topbarControls : current.topbarControls,
          // Absent means "leave it alone"; an empty string means "clear it". The
          // difference matters because the sidebar saves this record on every drag,
          // and treating a missing field as empty would wipe somebody's stylesheet
          // the first time they reordered a nav row.
          ...(typeof body.customCss === "string" ? { customCss: body.customCss } : { customCss: current.customCss }),
        }, Math.max(Date.now(), current.updatedAt + 1));
        return { kind: "saved" as const, layout };
      },
    );
    if (outcome.kind === "conflict") {
      return NextResponse.json({
        ok: false,
        error: "This layout changed in another session. Review the latest layout and try again.",
        code: "stale_chrome_layout",
        layout: outcome.layout,
      }, { status: 409, headers: PRIVATE_NO_STORE });
    }
    if (outcome.kind === "icon-attached") {
      return NextResponse.json({
        ok: false,
        error: "Remove the uploaded icon before removing its tool.",
        code: "saved_tool_icon_attached",
        layout: outcome.layout,
      }, { status: 409, headers: PRIVATE_NO_STORE });
    }
    return NextResponse.json({ ok: true, layout: outcome.layout }, { headers: PRIVATE_NO_STORE });
  } catch (error) {
    if (error instanceof ProductWorkspaceBusyError) return chromeLayoutBusy();
    return authErrorResponse(error);
  }
}

// Two chrome clients (the sidebar drag store and the topbar pin sheet) write this
// record, and a whole-record save holds the account lane while its durable write
// completes. Under a slow persistent write a concurrent save can find the lane
// busy — a transient, retriable condition, not a server fault. Answer 503 +
// Retry-After so the client can re-save rather than surfacing a 500.
function chromeLayoutBusy(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Another change to your layout is still saving. Try again in a moment.", code: "chrome_layout_busy" },
    { status: 503, headers: { ...PRIVATE_NO_STORE, "retry-after": "1" } },
  );
}

/** Put the sidebar back the way it ships. Saved tabs survive — they are not an arrangement. */
export async function DELETE() {
  try {
    await ensureHydrated();
    const who = await requireSelf().catch(() => null);
    if (!who) return unauthorised();
    const layout = await withPortalStateTransaction(
      userChromeLayoutLockKey(who.agencyId, who.userId),
      () => {
        const current = getUserChromeLayout(who.agencyId, who.userId);
        return resetUserChromeOrder(
          who.agencyId,
          who.userId,
          Math.max(Date.now(), current.updatedAt + 1),
        );
      },
    );
    return NextResponse.json({ ok: true, layout }, { headers: PRIVATE_NO_STORE });
  } catch (error) {
    if (error instanceof ProductWorkspaceBusyError) return chromeLayoutBusy();
    return authErrorResponse(error);
  }
}
