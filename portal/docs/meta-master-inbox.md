# Meta Master Inbox activation

The application layer is complete and deliberately fail-closed. Until the
values below are present, AquaCRM displays `Awaiting Meta values`, does not
start OAuth, rejects unsigned webhooks, and cannot send social messages.

## What is already wired

- Instagram Login for professional accounts without a linked Facebook Page.
- Facebook Login for Business for Pages and their linked Instagram accounts.
- HMAC-signed OAuth state tied to the signed-in agency and user.
- AES-256-GCM encryption for account access tokens.
- `X-Hub-Signature-256` verification before a webhook is accepted.
- Idempotent webhook event storage, retry backoff and atomic queue claims.
- Normalisation of text, attachments, shares, story messages, reactions,
  postbacks, echoes and deletions into the unified inbox model.
- A 24-hour response deadline, unread counts, first-response timing,
  assignments, internal notes and CRM identity-link fields.
- Outbound sending with pending, sent and failed states.
- A local JSON adapter for development and indexed Supabase tables for live use.

## Values to inject

Set these in `.env.local` for a public development tunnel/staging environment
and in the production deployment's encrypted environment settings:

```dotenv
INBOX_STORAGE_BACKEND=supabase
META_APP_ID=
META_APP_SECRET=
META_WEBHOOK_VERIFY_TOKEN=
META_GRAPH_API_VERSION=
NEXT_PUBLIC_PORTAL_BASE_URL=https://your-public-aquacrm-domain.example
PORTAL_SESSION_SECRET=
PORTAL_VAULT_ENCRYPTION_KEY=
CRON_SECRET=
INBOX_WEBHOOK_RETENTION_DAYS=30
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Do not put App Secrets, access tokens, the service-role key or vault keys in
Marketing profile notes, browser code, screenshots, chat messages or Git.
Account access tokens are obtained through OAuth and encrypted automatically.

## Database activation

Apply:

`supabase/migrations/20260811113000_master_inbox_messaging.sql`

The migration creates private service-role-only tables for connections,
identities, conversations, messages and webhook events. It also installs
`claim_inbox_webhook_events`, which uses `FOR UPDATE SKIP LOCKED` so parallel
workers cannot claim the same delivery event.

## Meta dashboard setup

1. Create or select a Meta Business app.
2. Add Instagram API, Messenger and Webhooks to the app.
3. Add this OAuth redirect URI exactly:
   `<NEXT_PUBLIC_PORTAL_BASE_URL>/api/portal/inbox/meta/callback`
4. Add this webhook callback URL exactly:
   `<NEXT_PUBLIC_PORTAL_BASE_URL>/api/webhooks/meta`
5. Enter the same private value used for `META_WEBHOOK_VERIFY_TOKEN`.
6. Subscribe Instagram messaging fields including `messages`,
   `messaging_postbacks`, `messaging_optins` and `messaging_referral`.
7. For Facebook Pages, subscribe the Messenger message, postback, read and echo
   fields exposed by the selected Graph API version.
8. Add owned test accounts as app roles while the Meta app remains in
   development mode.
9. Complete Advanced Access/App Review before connecting client-owned accounts.

Instagram Login requests `instagram_business_basic` and
`instagram_business_manage_messages`. Facebook Login requests the Page and
Instagram permissions required to discover Pages, subscribe them and reply.
The exact approved set is visible in `src/lib/server/integrations/metaMessaging.ts` and
should be reconciled with the pinned Graph API version during review.

## Runtime routes

- `GET /api/portal/inbox/meta/start` starts a signed connection flow.
- `GET /api/portal/inbox/meta/callback` exchanges the code and subscribes the account.
- `GET|POST /api/webhooks/meta` verifies and accepts Meta webhooks.
- `GET /api/cron/inbox` retries queued events using `Authorization: Bearer <CRON_SECRET>`.
- `GET|PATCH|DELETE /api/portal/inbox/connections` manages connected profiles.
- `GET|PATCH /api/portal/inbox/conversations` manages queue state and CRM links.
- `POST /api/portal/inbox/messages` sends a reply or records an internal note.

The existing founder-gated `/api/internal/sweep` also processes the inbox queue
for local diagnostics. Production should schedule `/api/cron/inbox` at least
once per minute as the retry safety net; normal webhooks are processed
immediately after the acknowledgement response.

## First connection check

1. Open Marketing, choose Social media and connect the matching profile.
2. Confirm Master Inbox shows the profile as `Live webhook subscribed`.
3. Send a DM to the professional account from a different Instagram account.
4. Confirm the conversation appears with an unread count and reply deadline.
5. Reply from AquaCRM and confirm the same message appears in the native inbox.
6. Delete or react to a test message and confirm the AquaCRM thread updates.
7. Inspect the channel's last-webhook timestamp and ensure the retry queue is empty.

Meta does not permit this connection to originate unsolicited cold DMs. A
normal conversation begins when the Instagram user messages the professional
account, and the composer respects the provider response window.
