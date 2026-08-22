# `scripts/smoke-enquiry-read-scoping.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Website-enquiry READ scoping — the multi-tenant boundary on the LIST path.  WHY THIS FILE EXISTS (HIGH severity, multi-tenant read): `listWebsiteEnquiries` reads `brand_enquiries` through the RLS-bypassing service-role admin client, so the raw query returns EVERY agency's enquiry rows (name/email/phone/message/metadata). RLS on the table is currently inert (`profiles.agency_id` unset) AND this path bypasses RLS anyway, so before the fix any internal user of any agency read all agencies' enquiry CONTENT through the ~12 surfaces that call this function. It was masked only because there is effectively one real tenant today.  The fix makes `agencyId` a REQUIRED parameter and filters the fetched rows through `enquiryBelongsToAgency` before mapping — reusing the SAME ownership predicate the per-row guard (`ownedEnquiry.ts`) uses, so it holds both before and after Ed's hand-applied `agency_id` migration.  These tests drive the raw function against an injected in-memory admin client carrying a MIXED-tenant `brand_enquiries` set. They FAIL against the pre-fix code, which returned all tenants' rows unfiltered.

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

