# `scripts/smoke-enquiry-tenant-isolation.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Website-enquiry tenant isolation — the multi-tenant boundary on brand_enquiries.  WHY THIS FILE EXISTS (HIGH severity, confirmed by security review): Every brand_enquiries row carries its tenant in `agency_id` (only after the hand-applied migration) and, always, in `metadata.agencyId`. The RLS policy is null-tolerant by design AND `profiles.agency_id` is not populated for anyone, so `current_profile_agency_id()` is null and the policy degrades to "any internal user manages EVERY agency's brand_enquiries". The website-enquiries routes addressed rows by id alone, trusting that inert RLS — so an owner of agency B could erase / reply to / read agency A's enquiries. Ids are not secret (any internal user can enumerate them).  The fix is an app-level ownership guard (`src/lib/supabase/ownedEnquiry.ts`) that every route now loads through, plus tenant-scoped matching in form-capture. This file proves the guard, drives the REAL erase handler across a tenant boundary, and pins the form-capture matcher.  Each test FAILS against the pre-fix code: the guard/matcher modules did not exist, and the erase route deleted any row by id regardless of tenant.

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

