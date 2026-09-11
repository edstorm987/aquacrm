# Google Maps scouting

## What ships

`/portal/agency/scouting` is the pre-lead Sales workspace. It uses the existing
agency-scoped Prospect service, qualification checks, outreach history, follow-
ups, notes, and Prospect -> Lead transition. It is not a second contact store.

The discovery surface combines two Google products with separate trust
boundaries:

- Maps Embed API renders the interactive map in an iframe. The iframe is a
  visual surface; browser same-origin rules do not let AquaCRM read a business
  selected inside it.
- Places API (New) Text Search runs server-side through AquaCRM's outbound
  broker. It returns a bounded, sanitised, no-store list that the user can select
  in AquaCRM and preview on the embedded map.

Google Places profile content is transient. AquaCRM stores the Google Place ID,
a Maps link derived from that ID plus an operator-entered business/person/address,
and the CRM fields/research the operator explicitly enters. It does not silently copy the returned name, address, phone, website,
reviews, photos, or rating into the prospect dossier. Place IDs may be retained;
Google recommends refreshing IDs older than 12 months.

## Required configuration

Create two keys. Never reuse one key across both surfaces.

1. `GOOGLE_PLACES_API_KEY` is server-only. Enable only Places API (New), add a
   server/IP application restriction where the deployment has stable egress,
   and configure a hard API quota plus billing alerts. Never expose it through a
   `NEXT_PUBLIC_` variable.
2. `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY` is intentionally browser-visible.
   Enable only Maps Embed API and restrict website referrers to the exact
   localhost, staging, and production origins that render AquaCRM.

Deployment environment keys belong only to the founder agency. Both the server
search key and the browser Embed key fail closed for every other agency through
`mayUseEnvironmentCredentials(agencyId)`, so a future SaaS tenant cannot spend
the platform account's Google budget. Before external agencies receive Places
search, add an encrypted, agency-owned Google credential connection and preserve
the same API/referrer restrictions, quota, audit, and egress controls.

Use separate keys/projects for staging and production when possible. Provider
credentials are deployment-owner actions; they are not created or rotated by
the application.

`GOOGLE_PLACES_SEARCHES_PER_TENANT_DAY` defaults to 500 and is capped at
10,000. Set it to the maximum paid searches one tenant may make in a UTC day.
This durable application ceiling is shared through plugin storage; the Google
Cloud API quota remains the outer spend firewall.

## Security controls

- The interactive Scouting page is owner/manager only and requires `growth.outreach.use`; its read API remains at `view`, while bulk import and dismissal require `manage`.
- Prospect and Google-search APIs independently enforce workspace-element
  access; hiding a navigation row is never treated as authorisation.
- Search requests are JSON-only, size-capped, schema-checked, Unicode-control
  filtered, rate-limited per tenant/actor/caller, and never logged with the API
  key.
- Before paid egress, a transaction-backed per-tenant daily counter is consumed;
  if its durable store is unavailable, search fails closed. Successful searches
  audit only result count and limit—not the potentially identifying query.
- Google egress goes through `brokeredFetch`, permits only
  `places.googleapis.com`, refuses redirects, and has request, response, and
  timeout ceilings.
- Provider results are normalised and URL fields are protocol/host checked
  before reaching the browser. Responses are `private, no-store`.
- Provider attribution is included in the fixed field mask and rendered next to
  the transient result. Roomy result and modal surfaces use Google's official,
  unmodified 98 x 18px dark-gray logo with the required clear space; all
  returned third-party provider names/links are retained. Attribution is never
  folded into the saved prospect record. The checked-in official asset at
  `public/attribution/google-maps-dark-gray.png` came from Google's attribution
  pack and has SHA-256
  `2096067a07a7fd7a6116a11544c7d9f311cb8c0f5e3b80ace4bcb96185b97d6a`.
- The iframe uses `strict-origin-when-cross-origin`, which lets Google's
  referrer restriction validate the site without disclosing the full CRM path.
- Sandbox/read-only provider policy remains authoritative; no live Places call
  is made when the environment forbids provider access.

## Compliance and operating boundary

Before enabling Places in a public deployment, the public Terms of Use and
Privacy Policy must cover Google Maps Platform as required by the current
Places policies. Check which Google terms apply to the billing account,
including the EEA-specific terms where relevant. This is an external legal and
account-owner acceptance gate, not something a passing code test can prove.

Official references:

- <https://developers.google.com/maps/documentation/embed/embedding-map>
- <https://developers.google.com/maps/documentation/places/web-service/text-search>
- <https://developers.google.com/maps/documentation/places/web-service/policies>
- <https://developers.google.com/maps/documentation/places/web-service/place-id>
- <https://developers.google.com/maps/api-security-best-practices>

## Incident response

If unexpected usage or spend appears, disable or rotate only the affected key,
inspect Google Cloud key/API metrics, retain AquaCRM security/audit evidence,
and re-enable after restrictions and quotas are verified. The split keys mean a
Places incident does not require taking the embedded map down, and an Embed key
leak does not expose the server-side search credential.

## Verification

Run the focused contracts before broader acceptance:

```bash
npm run typecheck
NODE_OPTIONS='--conditions react-server' node --import tsx --test scripts/smoke-google-places-scouting.test.ts
NODE_OPTIONS='--conditions react-server' node --import tsx --test scripts/smoke-plugin-agency-route-access.test.ts
NODE_OPTIONS='--conditions react-server' node --import tsx --test scripts/smoke-scouting-workspace.test.ts
```

Browser acceptance must cover desktop and 320px layouts, 200% zoom, keyboard
search/result selection, modal focus entry/trap/return, missing-key states, a
real restricted-key search in staging, prospect creation, qualification,
outreach logging, meeting handoff, and conversion into Journey.
