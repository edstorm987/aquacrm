# Portal tiers and fractal fulfilment

Ed's model, written down 18 August 2026 so it can be argued with rather than
carried around in one head.

## The idea

Every client starts with a portal inside Aqua. Some clients level up: a
software or website client gets an application built for them, and their Aqua
portal connects to it so the commercial relationship — billing, requests,
files, the account — stays where it always was.

Web-focused clients then receive the editor themselves, for their own
property. Aqua uses a tool; Aqua's clients get the same tool one level down.
Ed calls it fractal fulfilment: seeds inside seeds.

## The three tiers

**Tier 1 — Aqua-hosted portal.** What exists today. Rendered by Aqua at
`/portal/customer/…`, designed in the Portal Studio, published through the
template and instance records. Nothing external. Most clients stay here and
that is a success, not a limitation.

**Tier 2 — Custom application, Aqua attached.** A real product built for the
client, in its own repository, deployed on its own domain. Aqua supplies the
account layer around it: billing, requests, files, support, delivery stage.
`provisionClientProject` already produces this shape — it copies a starter,
git-inits it, and bakes `AQUA_ORIGIN` and `CLIENT_PORTAL_URL` into the
template, so the generated app knows how to reach back.

**Tier 3 — The client's own product, with their own clients.** The client is
now running something with customers of their own, and needs the editing tools
Aqua uses. This is where the fractal closes: the registry, the editing engine
and the three modes are handed down, scoped to the client's repository rather
than ours.

## What must never move

The commercial relationship. Whatever else becomes external — the product, the
domain, the deployment — billing, contracts, requests and the record of work
stay in Aqua. That is what keeps this an operating system for a business
rather than a hosting company with a CRM attached.

Everything below is negotiable. That is not.

## The embed question — settled

Linked, not embedded. The client's application is the destination and carries a
sidebar item, `Aqua`, which opens their portal in a new tab.

That is the right answer and it is already the pattern in the one starter that
exists. `aqua.config.json` gives a generated repository its identity —

```json
{ "clientId": "…", "portalUrl": "…", "aquaOrigin": "…", "propertyId": "…" }
```

— and `index.html` links out to `{{CLIENT_PORTAL_URL}}` from the header and the
footer.

Why it is right, rather than merely decided: each side keeps its own session,
so neither has to trust a token it did not mint. Nothing depends on
third-party cookies, which browsers are steadily removing and which break
iframed authentication first. Each side can be styled as itself instead of
being squeezed into a frame. And the client's product stays the destination —
Aqua is where they go to deal with us, not a wrapper around their own work.

The cost is that it is two places rather than one seamless surface. Given the
account area is visited occasionally and the product is used daily, that is the
right trade.

`aqua.config.json` is also more than provisioning exhaust: it is how a
repository declares which client it belongs to, which is exactly what the
editor needs in order to scope a Tier 3 client to their own repository and
nobody else's.

## What already exists

- `provisionClientProject` — starter → repository, tokens replaced, git initialised
- `publishProjectToGitHub` — real commits (currently refuses paths outside the provisioned workspace)
- Registry, patch, hash checking, branch publish — built and tested, never run against a real repository
- `EditAdapter` engine — one editing loop; conflict detection, dry runs, all-or-nothing publishing
- Repository browser and element-to-source picker, inside the Studio
- Three editing modes, gating the inspector by depth
- Editing leases and the client-blocking overlay — built, not mounted

## What is missing

1. **A tier on the client record.** Nothing currently says which of the three a
   client is on, so nothing can behave differently. This is the smallest change
   and everything else depends on it.
2. **Saving from the editor.** The commit path has never run against a real
   repository. Until it has, the editor is a viewer.
3. **An application starter.** The only starter is a marketing site, and Ed's
   Tier 2 shape is an application with a sidebar. The link also needs
   `target="_blank"` so Aqua opens in a new tab rather than navigating away
   from the product.
4. **Scoping the editor to a client's repository.** The registry takes a
   repository already; what is missing is the permission model — a Tier 3
   client editing their repository and nobody else's.
5. **Deploy feedback.** A client editing their site needs to see the build
   succeed or fail. Without it, publishing is a coin toss.
6. **Simple mode as a real surface.** Today it is the Content tab with the
   others hidden. A client-facing editor needs a purpose-built inline editing
   experience, not a narrower version of an agency tool.

## Order

Tier field first — it is small and unblocks conditional behaviour. Then prove
the commit path on a scratch repository, because everything editor-shaped is
theoretical until that works once. Then the embed decision, since it shapes
authentication and cannot be retrofitted cheaply. Simple mode and deploy
feedback follow, as they are the client-facing half and should be built once
the mechanics underneath them are known to work.
