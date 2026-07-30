# Development Workspace Cleanup

This inventory separates material that is now catalogued in the Development workspace from generated files and historical working material. Source folders still require the review gate below; generated output already proven inactive can be removed safely.

## Verified Catalogue

Verified on 27 July 2026:

- 298 Development resources are stored.
- 298 resources point to existing local paths; no broken path was found.
- 39 Git templates, 1 SEO tool, 3 deployment templates, 236 knowledge records and 19 saved design references are catalogued.
- Re-running `pnpm run catalogue:development` imports 0 duplicates and skips the same 298 records.
- All build-stage attachments use workflow-qualified references; no legacy stage-only references remain.
- Authenticated create, search, update, credential reveal and delete checks completed with no temporary records left behind.

## Keep In Place

- `04-milesymedia-portal/milesymedia-portal/portal`: the live Milesymedia application.
- `04-milesymedia-portal/milesymedia-portal/github-templates`: reusable modules and starters. Development now indexes these as Git templates rather than copying them into portal data.
- `04-milesymedia-portal/milesymedia-portal/client-projects`: managed customer source projects.
- `04-milesymedia-portal/milesymedia-portal/development-assets`: canonical saved inspiration and future Development source assets.
- `scripts/templates`: reusable deployment templates.

## Catalogued In Development

- `github-templates/modules/*`: reusable modules, components and product capabilities.
- `github-templates/starters/*`: complete project starting points.
- `01 development/context/prior research/*.md`: searchable knowledge records that retain their source path.
- top-level `01 development/*.md`: planning and operating notes.
- `scripts/templates/*`: launch-stage templates.
- `development-assets/inspiration/**/*`: authenticated visual inspiration cards with image previews.

The catalogue stores references and metadata, not duplicate file contents. This keeps the application fast and preserves Git as the source of truth for code.

## Review Then Archive

- `01 development/messages`, `01 development/terminal-prompts`, `01 development/old files` and `_obsolete`: completed. These were moved to the verified historical archive below and removed from the active workspace.
- `04-milesymedia-portal/demo portals`: review for unique visual or interaction references; save valuable examples as inspiration resources before archiving.
- `04-milesymedia-portal/plugins`: completed. All 39 legacy plugin folders were compared against `github-templates/modules`. Thirty-seven were source-identical; the two differences were reviewed and the canonical Git-template versions were newer. The legacy copies were removed, leaving the `.gitkeep` placeholder only.

## Safe Generated Cleanup

- `.next` directories are generated build output and can be deleted when the related dev server is stopped.
- On 27 July 2026, inactive `.next` output was removed from the old standalone website and three client preview projects, reclaiming approximately 1.2 GB. The active portal `.next` directory was retained for localhost `3030`.
- `.DS_Store` files are Finder metadata and have been removed outside dependency folders.
- Duplicate legacy plugin source was removed after hash comparison; `github-templates/modules` is now the single reusable-module source of truth.
- duplicate `node_modules` directories can be regenerated from lockfiles. Remove only while no local server or build is running, then reinstall in the one active app.

Inactive dependency installs were removed only after confirming a lockfile existed and no related process was running:

- three client preview `node_modules` folders: approximately 1.2 GB combined;
- old standalone website `node_modules`: approximately 377 MB;
- nested leads-pipeline `node_modules`: approximately 356 MB.

The one active root `node_modules` install remains.

## Historical Archive

- Path: `/Users/eds/Desktop/Projects/Milesymedia-archives/2026-07-27/milesymedia-historical-workspace-2026-07-27.tar.gz`
- Contents: 3,454 archived paths.
- Integrity: `gzip -t` passed.
- SHA-256: `331c60e7ce45cc2518399aa843ae97ed60c85190bc1edaf13c1e6c6486bf5f57`.

The active workspace reduced from approximately 4.5 GB to 937 MB. The unified portal is running from a fresh generated cache at `http://localhost:3030`.

## Do Not Store In Plain Files

- Passwords, recovery codes, API secrets and private tokens belong in the encrypted Development Knowledge Vault or an external password manager.
- The portal requires `PORTAL_VAULT_ENCRYPTION_KEY` in production before it will save new passwords.

## Cleanup Gate

Before deleting a source folder:

1. Open Development > Toolkit and Development > Knowledge Vault.
2. Confirm the folder's useful items are present and searchable.
3. Open representative source paths to confirm they still resolve.
4. Save unique images or design references as uploaded inspiration resources.
5. Archive or delete only after the useful count and catalogue count agree.
