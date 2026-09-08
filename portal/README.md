# AquaCRM

A single Next.js application serving the AquaCRM public website, secure
sign-in, the internal agency workspace, and branded customer portals. Public
sites submit centrally to AquaCRM while preserving their trading brand,
source, campaign, requested services, and consent record.

## Documentation

- `CLAUDE.md` is the AI collaborator entrypoint.
- `docs/PRODUCT-ARCHITECTURE.md` defines domain ownership and the agency/client
  macro and micro model.
- `docs/CURRENT-IMPLEMENTATION.md` records implemented systems, integration
  truth boundaries, and recent upgrades.
- `docs/development/PRODUCTION-READINESS.md` is the current evidence-backed
  launch assessment; `docs/development/TODO.md` is the one current task list.
- `docs/DEVELOPMENT-HANDOFF.md` covers repository workflow, persistence,
  testing, permissions, Git safety, and deployment.

## Local

```bash
npm install --legacy-peer-deps
npm run dev:sandbox
```

Open `http://localhost:3032`. The website is `/`, sign-in is `/login`, and all
authenticated workspaces live below `/portal`.

`npm run dev` does not force a local backend. When Supabase credentials are in
`.env.local` and `PORTAL_BACKEND` is unset, it can read and write the production
datastore. Use the sandbox command for normal local work; use the plain command
only when production-backed operation is explicit and authorised.

## Production deployment

The current production substrate is Railway, serving `www.aqua-crm.com` from
`edstorm987/aquacrm@main` with repository root `portal`. Vercel configuration
remains supported by the repository but is not the current deployment authority.
Do not follow older Vercel-only launch plans without reconciling them against
Railway and the current readiness assessment.

The production launch gate requires:

- Supabase: URL, anon key, service-role key, public bucket, and private upload
  bucket. `PORTAL_BACKEND=supabase` is optional because the app detects a
  complete Supabase configuration.
- Secure sessions: `PORTAL_SESSION_SECRET`, `NEXT_PUBLIC_PORTAL_SECURITY=strict`, and the HTTPS `NEXT_PUBLIC_PORTAL_BASE_URL`
- Email: Resend for access/security mail and enquiry notifications
- Payments: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
- Private assistant: `OPENAI_API_KEY` and optional `OPENAI_ASSISTANT_MODEL`
- External assistant gateway: `MILESYMEDIA_ASSISTANT_API_TOKEN` and
  `MILESYMEDIA_ASSISTANT_AGENCY_ID` (defaults to `milesymedia`). The live,
  read-only OpenAPI contract is served from `/api/v1/openapi.json`; a reusable
  skill is in `assistant-integrations/milesymedia-api/SKILL.md`. Setup and
  endpoint guidance is in `docs/external-assistant-api.md`.
- Durable private uploads: `NEXT_PUBLIC_SUPABASE_UPLOAD_BUCKET` (normally
  `aquacrm-uploads`). Existing Vercel Blob references remain readable for
  migration compatibility, but new uploads use Supabase Storage.

Set `FOUNDER_EMAIL`, `FOUNDER_PASSWORD`, and `FOUNDER_AGENCY_NAME` for the first owner account. Rotate the local founder password before any public launch.

The assistant at `/portal/agency/assistant` is available to agency owners and
managers. It receives a fresh, redacted, read-only snapshot of the active
business with each request and stores chat history plus personal memories in
the portal backend. The API key stays server-side. ChatGPT subscriptions and
OpenAI API billing are separate, so a Platform API key is required.

Meeting invoices can collect one-off, recurring, or fixed-instalment card
payments through Stripe Checkout. Register
`/api/portal/leads-pipeline/commercial/stripe-webhook?agencyId=<agency-id>` as
the Stripe webhook endpoint and subscribe it to `checkout.session.completed`
and `invoice.paid`. Bank transfer and cash payments can also be recorded
manually, with references and emailed receipts retained in the audit trail.

The complete variable names and safety notes live in `.env.example`. Local
secrets belong in `.env.local`; never commit them.

After configuring the production deployment, confirm:

- `/healthz` returns `200` for liveness.
- `/healthz/full` returns `200` and `"readyForProduction": true`.
- Agency Settings → Launch shows all four required services as ready.

The deep probe deliberately stays unready until required email, storage,
database, HTTPS, and session-security settings are present in production.
On 8 September 2026 the live deep probe still reported
`readyForProduction:false` because required email was not configured, and the
apex domain failed TLS validation. See the current readiness assessment rather
than treating the presence of a live homepage as launch approval.
