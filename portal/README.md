# AquaCRM

One private Next.js application for secure sign-in, agency operations, and
customer portals across Zimante Group companies. Milesymedia is the founding
business inside AquaCRM, not the name of the platform.

It is also the central operating system for Zimante Group and its specialist
trading identities. See
[`docs/zimante-brand-architecture.md`](docs/zimante-brand-architecture.md) for
the public-site boundaries and shared enquiry contract.

## Local

```bash
npm install --legacy-peer-deps
npm run dev
```

Open:

- https://aqua-crm.com
- https://aqua-crm.com/login?next=/portal

## Vercel

When deploying from the repository root, the root `vercel.json` builds:

```text
04-milesymedia-portal/milesymedia-portal/portal
```

The production launch gate requires:

- Postgres: `DATABASE_URL` and `PORTAL_BACKEND=postgres`
- Secure sessions: `PORTAL_SESSION_SECRET`, `NEXT_PUBLIC_PORTAL_SECURITY=strict`, and the HTTPS `NEXT_PUBLIC_PORTAL_BASE_URL`
- Transactional email: `POSTMARK_SERVER_TOKEN` and `MILESYMEDIA_FROM_EMAIL`
- Payments: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
- Private assistant: `OPENAI_API_KEY` and optional `OPENAI_ASSISTANT_MODEL`
- External assistant gateway: `MILESYMEDIA_ASSISTANT_API_TOKEN` and
  `MILESYMEDIA_ASSISTANT_AGENCY_ID` (defaults to `milesymedia`). The live,
  read-only OpenAPI contract is served from `/api/v1/openapi.json`; a reusable
  skill is in `assistant-integrations/milesymedia-api/SKILL.md`. Setup and
  endpoint guidance is in `docs/external-assistant-api.md`.
- Durable private uploads: one supported Vercel Blob credential

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

After configuring Vercel, confirm:

- `/healthz` returns `200` for liveness.
- `/healthz/full` returns `200` and `"readyForProduction": true`.
- Agency Settings → Launch shows all four required services as ready.

The public website is `/`, sign-in is `/login`, and all authenticated
workspaces live under `/portal` on the same origin.
