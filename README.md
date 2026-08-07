# AquaCRM

## Deployment

The production application lives in `portal/`. Configure the Vercel project
Root Directory as `portal`; do not use a custom output directory. The public
website is still served at `/`, with sign-in at `/login` and the authenticated
workspace under `/portal`.

Production secrets belong in Vercel environment variables and must never be
committed. The local-only `Dev Team/vercel-env.local` file is the deployment
handoff for importing those values.

This repo is split into three clear areas:

- `portal/` — the runnable AquaCRM application and Milesymedia operating workspace. Its product modules are built into the app under `portal/src/built-ins/`.
- `website/` — the editable source copy of the AquaCRM public website. Its production assets are mirrored into the portal app so one deployment serves the whole product.
- `github-templates/` — reusable project blocks and build kits Codex can copy into separate client repositories.

Each client production website and custom portal lives in its own GitHub repository. The client signs into that branded portal first; its Aqua sidebar entry opens AquaCRM in a new authenticated tab. AquaCRM tracks onboarding, delivery, billing, support and live performance through the Aqua tag.

## Local Portal

```bash
cd portal
npm install --legacy-peer-deps
npm run dev
```

Open `http://localhost:3032`.

## Vercel

When importing this repo into Vercel, set the project root directory to:

```text
portal
```

Do not create a second AquaCRM website deployment. The Next.js app serves the
public website and authenticated portal together.

## Template Library

Use `github-templates/modules/` as reference code for future client builds. For example, if a new client needs ecommerce, copy/adapt the ecommerce module from there into the client’s separate production repo.
