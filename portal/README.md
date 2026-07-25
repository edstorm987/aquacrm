# Milesymedia Portal

Standalone Milesymedia agency and customer portal for local development and Vercel.

## Local

```bash
npm install --legacy-peer-deps
npm run dev
```

Open:

- http://localhost:3032
- http://localhost:3032/login?next=/portal

## Vercel

Import the repository and set its Root Directory to:

```text
portal
```

The production launch gate requires:

- Postgres: `DATABASE_URL` and `PORTAL_BACKEND=postgres`
- Secure sessions: `PORTAL_SESSION_SECRET`, `NEXT_PUBLIC_PORTAL_SECURITY=strict`, and the HTTPS `NEXT_PUBLIC_PORTAL_BASE_URL`
- Transactional email: `POSTMARK_SERVER_TOKEN` and `MILESYMEDIA_FROM_EMAIL`
- Durable private uploads: one supported Vercel Blob credential

Set `FOUNDER_EMAIL`, `FOUNDER_PASSWORD`, and `FOUNDER_AGENCY_NAME` for the first owner account. Rotate the local founder password before any public launch.

After configuring Vercel, confirm:

- `/healthz` returns `200` for liveness.
- `/healthz/full` returns `200` and `"readyForProduction": true`.
- Agency Settings → Launch shows all four required services as ready.

The public Milesymedia website is intentionally not mounted in this app.
