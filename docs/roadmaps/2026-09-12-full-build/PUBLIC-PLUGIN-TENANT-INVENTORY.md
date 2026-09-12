# Public plugin tenant-authority inventory

Status: **independently accepted locally** under `PUBLIC-PLUGIN-TENANT-001`.
This remains a source/local-test inventory, not provider, deployed or production
acceptance. The per-row `VERIFY`/`REVIEW` labels below are the historical labels
used while the matrix was assembled; the current roll-up truth is the accepted
queue row and its evidence.

Boundary: no network, deployed service, provider, database, secret, push, merge, migration apply, or production data was touched.

## Foundation rule

The catch-all dispatcher must use caller-supplied `agencyId` and `clientId` only to locate a candidate public route. Every public handler must then establish its own authority for the exact resolved install before it reads or mutates tenant data. Authority can be one of:

1. an exact published-site registry plus exact request Origin and, for mutations, an exact-action managed human proof;
2. a provider-authenticated event whose signed payload or configured endpoint identity is bound to the exact install/account/customer being mutated; or
3. an opaque, high-entropy install capability stored only as a digest and rotatable/revocable by an authorised operator.

The query/header tenant ids are routing hints, never authority. A per-install secret comparison is useful but is not sufficient if secrets can be duplicated across installs and the signed payload is not checked against an install-owned provider identity.

## Current mounted inventory

There are 15 `public: true` plugin routes in seven modules.

| Module | Route | Data class | Current local authority | Gate |
| --- | --- | --- | --- | --- |
| affiliates | `webhooks/stripe` | provider write | bounded body/signature-first; Affiliates owns a separate vault-backed Connect endpoint secret and discards Ecommerce's endpoint secret; account/transfer application resolves only exact install-owned provider ids | VERIFY |
| agency-finance | `stripe/webhook` | provider write | bounded raw body and signature-before-body; checkout stamps exact agency/client scope and webhook plus reconciliation require the same signed scope before mutation | VERIFY |
| memberships | `stripe/webhook` | provider write | bounded raw body and signature-before-body; existing service asserts exact signed agency/client scope before applying provider state | VERIFY |
| ecommerce | `stripe/webhook` | provider write | bounded raw body and signature-before-body; completed/expired events require exact signed agency/client scope before delivery-ledger or order mutation | VERIFY |
| leads-pipeline | `commercial/stripe-webhook` | provider write | bounded raw body and signature-before-config/body; an existing mismatched signed agency is refused before provider lookup and exact agency is required before mutation | VERIFY |
| email-sender | `public/webhook/postmark` | provider write | query credentials rejected; bounded body after exact Basic/header capability; constant-time compare; exact local MessageID ownership precedes a durable atomic idempotency claim so shared-secret replay cannot mutate or poison another install | VERIFY |
| ecommerce | `storefront/products` | published read | exact registered storefront Origin or same-origin Referer before durable rate limit; published allowlisted DTO only | VERIFY |
| ecommerce | `storefront/products/get` | published read | exact registered storefront Origin or same-origin Referer before durable rate limit; published allowlisted DTO only | VERIFY |
| ecommerce | `storefront/checkout/quote` | public compute/read | exact registered storefront Origin before rate limit and authoritative quote work | VERIFY |
| ecommerce | `storefront/stripe/checkout` | provider write | exact registered Origin, paid/free action proof, authoritative quote class and atomic multidimensional budgets implemented locally | VERIFY |
| ecommerce | `storefront/orders/by-session` | receipt read with customer email | exact registered storefront Origin or same-origin Referer before rate limit plus opaque provider session and narrow receipt DTO | VERIFY |
| website-editor | `visitor/contact` | PII write | exact active site, exact allowed Origin hostname, published block/consent, exact-action proof and transactional limits | VERIFY |
| website-editor | `visitor/newsletter` | PII write | exact active site, exact allowed Origin hostname, published block/consent, exact-action proof and transactional limits | VERIFY |
| website-editor | `public/blog/posts` | published read | exact site within caller-selected install and published-only DTO; direct public access is intentional, but tenant-routing semantics need explicit acceptance | REVIEW |
| website-editor | `public/blog/posts/by-slug` | published read | exact site within caller-selected install and published-only DTO; direct public access is intentional, but tenant-routing semantics need explicit acceptance | REVIEW |

## Acceptance tests required

- Inventory test fails if any new `public: true` route lacks a declared authority class.
- Same signed provider event cannot mutate a different install even when two installs deliberately share a webhook secret.
- Provider events must bind an install-owned account/customer/subscription/message identity before any mutation.
- Unknown, disabled, archived, duplicated, or cross-tenant install bindings fail closed without revealing whether the target exists.
- Storefront public reads and receipt lookup bind to the exact registered published host; preview/draft/admin renders cannot expose the public facade.
- Public content routes return allowlisted published DTOs only and never operator metadata, drafts, credentials, internal ids beyond the documented public contract, or cross-install rows.
- Every public mutation has durable idempotency, atomic multi-instance admission, bounded request bytes/time, generic failures, and no raw secrets/PII in operational telemetry.
- Tests use in-process or `127.0.0.1` fakes only. Real provider and staging checks remain a separate human release gate.

## Current acceptance state

The typed public-route authority registry, registered-host binding for every storefront facade, bounded bodies for all six provider webhooks, exact signed scope for Finance, Memberships, Ecommerce, and Leads, endpoint-secret separation for Affiliates, and non-query capability plus exact MessageID ownership for Postmark are implemented and independently accepted locally. Real provider, staging and deployed-origin checks remain human/live release gates.
