-- Explicit table grants for the roles the policy set assumes. → issues #1 (RLS), #87
--
-- The tables created before 2026-08-23 never granted anything themselves: they
-- inherited the cloud project's default privileges (GRANT ALL to anon,
-- authenticated and service_role, with RLS doing the filtering). That is why
-- the live project works and why a rebuilt project, or a local
-- `supabase start`, does not — there the defaults grant no DML at all, and the
-- portal's service-role reads of `app_datastores` answer 42501 (found on the
-- 2026-09-03 isolated rehearsal). The newer tables already state their grants;
-- this migration says the same thing for the older ones, so the posture is
-- written down rather than inherited.
--
-- Idempotent and a no-op where the grants already exist. It grants nothing a
-- policy does not already assume: service_role (the portal's own client for
-- these tables) gets DML; anon and authenticated get exactly the verbs their
-- policies use, and RLS continues to decide the rows.

-- The portal's service-role client (bypasses RLS by design; see README §"RLS is defence-in-depth").
grant select, insert, update, delete on table
  public.profiles, public.brands, public.clients, public.client_portals,
  public.client_portal_members, public.audit_events, public.shoots, public.shoot_photos,
  public.brand_enquiries, public.app_datastores, public.website_consent_events
to service_role;

-- Public website content: read by strangers, by design (policies `using (true)`).
-- authenticated gets SELECT only here, deliberately narrower than the tables'
-- FOR ALL "Internal users manage" policy: the portal never writes brands/shoots/
-- shoot_photos through a browser session — the sibling websites manage them with
-- the service_role key (granted full DML above), so read is all the authenticated
-- role needs and least privilege keeps it there.
grant select on table public.brands, public.shoots, public.shoot_photos to anon, authenticated;

-- The website contact form: anon may only INSERT, and only what the policy's
-- WITH CHECK accepts. Internal users manage rows through the authenticated role.
grant insert on table public.brand_enquiries to anon;
grant select, insert, update, delete on table public.brand_enquiries to authenticated;

-- Everything internal users manage through their own session via a FOR ALL policy.
grant select, insert, update, delete on table
  public.profiles, public.clients, public.client_portals, public.client_portal_members,
  public.app_datastores, public.website_consent_events
to authenticated;

-- audit_events is append-only: its only policies are FOR SELECT and FOR INSERT
-- (20260731120000). Grant authenticated exactly those two verbs — never UPDATE or
-- DELETE — so the audit log cannot be tampered with even if a permissive policy is
-- ever added by mistake. (service_role keeps full DML above for retention sweeps.)
grant select, insert on table public.audit_events to authenticated;

-- `app_datastore_history` keeps its deliberately narrower grant from
-- 20260809090000 (service_role SELECT only); `app_datastore_patch_receipts`
-- is reached only inside SECURITY DEFINER functions and needs no direct grant.
