# GitHub Templates

Reusable source blocks for building separate client repositories.

These are not the Milesymedia portal itself. They are reference modules Codex can copy, adapt, and wire into a client’s production website or custom portal.

## Intended Flow

1. Create/manage the client inside `portal/`.
2. Build their prelaunch portal in Milesymedia.
3. Create a separate GitHub repo for the client.
4. Copy only the modules needed from this folder.
5. Build the client’s production website/custom portal in that repo.
6. Add the Milesymedia tag/sidebar so production status, support, analytics, and outages report back into Milesymedia.

## Modules

`modules/` contains reusable blocks such as ecommerce, bookings, forms, memberships, affiliates, support, GA4, and website editor pieces.

Treat these as starting points, not installed runtime plugins. The final client repo should contain only what that client actually needs.
