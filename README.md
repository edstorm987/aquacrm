# AquaCRM / Milesymedia Delivery Hub

This repo is split into two clear areas:

- `portal/` — the runnable Milesymedia portal app. This is the prelaunch/client delivery hub that goes to Vercel. Its product modules are built into the app under `portal/src/built-ins/`; it does not rely on a separate plugin folder.
- `github-templates/` — reusable project blocks and build kits Codex can copy into separate client repositories.

The client production websites and custom portals should live in their own GitHub repos. Milesymedia tracks the project, builds the prelaunch portal, and later connects to production through a Milesymedia tag/sidebar.

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

## Template Library

Use `github-templates/modules/` as reference code for future client builds. For example, if a new client needs ecommerce, copy/adapt the ecommerce module from there into the client’s separate production repo.
