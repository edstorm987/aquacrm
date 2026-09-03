import { NextResponse, type NextRequest } from "next/server";

import { encryptInboxSecret } from "@/lib/server/inbox/inboxVault";
import { saveInboxConnection } from "@/lib/server/inbox/inboxStore";
import {
  exchangeMetaOAuthCode,
  readMetaMessagingConfig,
  subscribeMetaWebhooks,
  verifyMetaOAuthState,
} from "@/lib/server/integrations/metaMessaging";
import { logActivity } from "@/server/activity";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { requireCurrentWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";

export async function GET(request: NextRequest) {
  await ensureHydrated();
  const stateValue = request.nextUrl.searchParams.get("state") ?? "";
  const state = verifyMetaOAuthState(stateValue);
  const fallback = "/portal/agency/inbox?view=social";
  if (!state.ok) return redirectResult(request, fallback, state.error);
  const returnUrl = state.data.returnUrl;

  let current;
  try {
    current = await requireCurrentWorkspaceElementAccess("staff", "workspace.inbox", "manage");
  } catch {
    return redirectResult(request, returnUrl, "session-required");
  }
  const session = current.actor.session;
  const agencyId = current.actor.resourceAgencyId;
  if (agencyId !== state.data.agencyId || session.userId !== state.data.userId) {
    return redirectResult(request, returnUrl, "state-owner-mismatch");
  }
  const providerError = request.nextUrl.searchParams.get("error");
  if (providerError) return redirectResult(request, returnUrl, providerError);
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return redirectResult(request, returnUrl, "missing-code");
  const config = readMetaMessagingConfig(agencyId, request.nextUrl.origin);
  if (!config) return redirectResult(request, returnUrl, "not-configured");

  try {
    const accounts = await exchangeMetaOAuthCode(config, code, state.data.mode);
    if (!accounts.length) return redirectResult(request, returnUrl, "no-eligible-accounts");
    let connected = 0;
    for (const account of accounts) {
      const subscription = await subscribeMetaWebhooks(config, account);
      await saveInboxConnection({
        agencyId,
        companyId: state.data.companyId,
        marketingAssetId: state.data.marketingAssetId,
        provider: "meta",
        channel: account.channel,
        authMode: account.authMode,
        externalAccountId: account.externalAccountId,
        externalPageId: account.externalPageId,
        username: account.username,
        displayName: account.displayName,
        avatarUrl: account.avatarUrl,
        scopes: account.scopes,
        status: subscription.subscribed ? "connected" : "needs-attention",
        webhookStatus: subscription.subscribed ? "subscribed" : "failed",
        encryptedAccessToken: encryptInboxSecret(account.accessToken),
        tokenExpiresAt: account.tokenExpiresAt,
        lastSyncAt: Date.now(),
        lastError: subscription.subscribed ? undefined : subscription.message,
      });
      if (subscription.subscribed) connected += 1;
    }
    logActivity({
      agencyId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "integrations",
      action: "meta-inbox.connected",
      message: `Connected ${accounts.length} Meta inbox channel${accounts.length === 1 ? "" : "s"}; ${connected} subscribed to live webhooks.`,
      metadata: { accountCount: accounts.length, connected, mode: state.data.mode },
    });
    await flushPendingWrites();
    return redirectResult(request, returnUrl, connected === accounts.length ? "connected" : "needs-attention", accounts.length);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "connection-failed";
    return redirectResult(request, returnUrl, message.slice(0, 180));
  }
}

function redirectResult(request: NextRequest, returnUrl: string, result: string, count?: number) {
  const target = new URL(returnUrl, request.nextUrl.origin);
  target.searchParams.set("meta", result);
  if (count !== undefined) target.searchParams.set("connected", String(count));
  return NextResponse.redirect(target, 302);
}
