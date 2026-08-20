# `src/app/api/auth/signup/route.ts`

← [File index](../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** POST /api/auth/signup — TWO callers, two completely different outcomes.  ─── 1. A native form post from a published website (the visitor path) ────  `SignupFormBlock` renders a plain `<form method="POST">` with no JS, so a visitor's browser full-page-navigates here with an `application/x-www-form-urlencoded` body. Two bugs met at that point:  (a) ENCODING. This route parsed with `req.json()` only, the parse threw, and the visitor landed on a raw `{"ok":false,"error":"Invalid request."}` blob with no way back. Same failure `api/auth/login` had (issues.md #14) and the fix is the same shape: branch on content-type, answer a browser with a 303 back to the page it came from, and put nothing about the submission in the URL.  (b) WHAT IT DID. Far worse than the blob. A visitor to a CLIENT's website who filled in "create account" was run through `bootstrapAgency()` — a whole new AGENCY, with core plugins installed and an owner login, created by a stranger from a contact form. Ed's decision (2026-08-20): "it creates a website lead not a client, key distinction... then we manually talk with the customer, book them a meeting, and then we have the create-customer button to turn them."  So the form path creates a LEAD and nothing else. It never calls `bootstrapAgency`, never calls `createUser`, never issues a session, and never reads a password. The lead lands in `leads-pipeline` — the same service `api/public/contact` and `api/public/brand-enquiry` already deposit website enquiries into — and an operator promotes it with the existing convert-to-client button when the conversation is real. No second capture mechanism was built for this.  ─── 2. A JSON post (the product path) ───────────────────────────────────  Unchanged, deliberately. AquaCRM's own product signup — somebody choosing to create an AquaCRM workspace — is a real thing and still bootstraps an agency + owner + verification email + auto-login. Every byte of that handler below is as it was; the form branch is in front of it, not around it.  The two are told apart by content-type, exactly as `api/auth/login` tells a browser post from a fetch caller. A published-site block can only ever produce the form-encoded kind, so a website visitor can no longer reach the agency-creating path at all.

## Exports (1)

- `async POST(req: NextRequest)`

## Depends on (15)

- [`src/built-ins/runtime/foundation-adapters/leadsPipelineFoundation.ts`](../../../../built-ins/runtime/foundation-adapters/leadsPipelineFoundation.md)
- [`src/lib/server/auth/auth.ts`](../../../../lib/server/auth/auth.md)
- [`src/lib/server/auth/emailVerification.ts`](../../../../lib/server/auth/emailVerification.md)
- [`src/lib/server/auth/postLoginRedirect.ts`](../../../../lib/server/auth/postLoginRedirect.md)
- [`src/lib/server/email/transactionalEmail.ts`](../../../../lib/server/email/transactionalEmail.md)
- [`src/lib/server/pluginStorage.ts`](../../../../lib/server/pluginStorage.md)
- [`src/lib/server/rateLimit.ts`](../../../../lib/server/rateLimit.md)
- [`src/lib/server/seeds/founderSeed.ts`](../../../../lib/server/seeds/founderSeed.md)
- [`src/server/activity.ts`](../../../../server/activity.md)
- [`src/server/agencyBootstrap.ts`](../../../../server/agencyBootstrap.md)
- [`src/server/pluginInstalls.ts`](../../../../server/pluginInstalls.md)
- [`src/server/storage.ts`](../../../../server/storage.md)
- [`src/server/tenants.ts`](../../../../server/tenants.md)
- [`src/server/users.ts`](../../../../server/users.md)
- [`src/server/websiteSources.ts`](../../../../server/websiteSources.md)

## Used by (1)

- [`scripts/smoke-website-signup-lead.test.ts`](../../../../../scripts/smoke-website-signup-lead.test.md)

