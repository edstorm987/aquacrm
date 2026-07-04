import { NextResponse } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { requireRoleForClient } from "@/lib/server/auth";
import { AGENCY_ROLES } from "@/server/types";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { getInstall } from "@/server/pluginInstalls";
import { makeCtx } from "@/plugins/_runtime";
import {
  applyStarterVariant,
} from "../../../../../plugins/website-editor/src/server/portalVariants";
import {
  applyIncubatorClientMetadata,
} from "../../../../../plugins/website-editor/src/server/incubatorTemplate";
import {
  getPage,
  updatePage,
} from "../../../../../plugins/website-editor/src/server/pages";

// T1 R14 — wire-up of T3 R010's Aqua Incubator preset.
//
// 1. Look up the website-editor plugin install for this client.
// 2. Build a PluginCtx (storage scope) via the runtime helper.
// 3. `applyStarterVariant({ variantId: "aqua-incubator", role: "account" })`
//    — creates a draft page seeded from the bundled starter tree.
// 4. Read the page back, run `applyIncubatorClientMetadata(blocks, ...)`
//    to substitute `{{phase}}`, `{{planTier}}`, etc., then `updatePage`
//    with the resolved blocks.
// 5. Persist `client.metadata.useIncubator: true` so subsequent renders
//    can short-circuit if needed.

interface Body {
  clientId: string;
  metadata: {
    phase?: string;
    planTier?: string;
    therapistName?: string;
    practiceName?: string;
    onboardingStartedAt?: string;
  };
}

export async function POST(req: Request) {
  await ensureHydrated();
  const body = await req.json().catch(() => null) as Body | null;
  if (!body?.clientId) {
    return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 });
  }
  const session = await requireRoleForClient([...AGENCY_ROLES], body.clientId);
  const client = getClientForAgency(session.agencyId, body.clientId);
  if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });

  const install = getInstall({ agencyId: session.agencyId, clientId: body.clientId }, "website-editor");
  if (!install) {
    return NextResponse.json({
      ok: false,
      error: "website-editor not installed for this client",
    }, { status: 412 });
  }

  const ctx = makeCtx(install, session.email);
  const result = await applyStarterVariant(
    {
      agencyId: session.agencyId,
      clientId: body.clientId,
      role: "account",
      variantId: "aqua-incubator",
      actor: session.userId,
    },
    ctx.storage,
  );
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
  }

  // Read the newly-created page, resolve placeholders, write back.
  const page = await getPage(ctx.storage, session.agencyId, body.clientId, result.siteId, result.pageId);
  if (page && page.blocks) {
    const resolved = applyIncubatorClientMetadata(page.blocks, {
      phase: body.metadata.phase ?? "Epic Intro",
      planTier: body.metadata.planTier ?? "Foundational Flow",
      therapistName: body.metadata.therapistName,
      practiceName: body.metadata.practiceName,
      onboardingStartedAt: body.metadata.onboardingStartedAt ?? "",
    });
    await updatePage(ctx.storage, session.agencyId, body.clientId, result.siteId, result.pageId, {
      blocks: resolved,
    });
  }

  // Mark on the client metadata so per-client rendering can know.
  updateClient(session.agencyId, body.clientId, {
    metadata: { useIncubator: true, incubatorAppliedAt: Date.now() },
  });

  return NextResponse.json({
    ok: true,
    variantId: result.variantId,
    pageId: result.pageId,
    siteId: result.siteId,
  });
}
