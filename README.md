# AquaCRM

This repo is split into three clear areas:

- `portal/` — the runnable AquaCRM application and Milesymedia operating workspace. Its product modules are built into the app under `portal/src/built-ins/`.
- `website/` — the separately deployable AquaCRM product website.
- `github-templates/` — reusable project blocks and build kits Codex can copy into separate client repositories.

Each client production website and custom portal lives in its own GitHub repository. The client signs into that branded portal first; its Aqua sidebar entry opens AquaCRM in a new authenticated tab. AquaCRM tracks onboarding, delivery, billing, support and live performance through the Aqua tag.

## Local Portal

```bash
cd portal
npm install --legacy-peer-deps
npm run dev
```

Open `http://localhost:3032`.

## Local Product Website

```bash
cd website
./start-local.sh
```

Open `http://localhost:3035`.

## Vercel

When importing this repo into Vercel, set the project root directory to:

```text
portal
```

For the product website deployment, use:

```text
website
```

## Template Library

Use `github-templates/modules/` as reference code for future client builds. For example, if a new client needs ecommerce, copy/adapt the ecommerce module from there into the client’s separate production repo.
