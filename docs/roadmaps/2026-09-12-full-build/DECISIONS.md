# Locked decisions and safe defaults

1. This is the full product path, not a disabled or reduced pilot.
2. Security and data isolation override convenience. Unsafe legacy behaviour may be removed while a verified replacement is built.
3. The acquisition flow is one canonical Person/Prospect/Lead/Contact/Client history with Scouting, optional/revisitable Researching, Outreach Command, Meetings, Inbox, and Contacts projections.
4. Founder/owner controls are based on the real signed-in role, not the temporary “Working as” department lens. A founder keeps founder topbar controls while viewing Sales.
5. Radar becomes one topbar control. It opens My Radar by default and exposes a My/Business toggle only when the actor has Business Radar access. No duplicate Radar buttons.
6. Command Centre becomes actionable and spacious: daily command, Core Drivers, Outliers, KPI Workspace, Executive, and expanded War Room are distinct workspaces/tabs reusing the existing KPI registry, evidence graph, Radar, and action machinery.
7. Dev is an explicit workspace switch for authorised app developers; it is not exposed by a department lens or to client project grants.
8. Saved tabs retain their controls wherever rendered. Reset returns defaults to their canonical topbar/sidebar positions; it does not erase user data.
9. Custom sidebar items are per-user unless explicitly shared by an authorised manager. URLs are allowlisted. Embed code runs only in an opaque-origin sandbox with no CRM state, cookies, same-origin privilege, secret access, or unsanitised parent messaging.
10. Agency Settings keeps its left navigation sticky and independently scrolls the right content pane, with a normal single-column fallback on small screens and zoom.
11. Inactivity check-in is restored as an accessible, non-destructive prompt. It must not falsely sign out active work, steal focus repeatedly, or lose unsaved input.
12. Kanban boards persist server-side, are tenant scoped, use checked/atomic mutations, and gate create/edit/reorder/custom-field operations by exact manage capability. Notes are typed entries with author and timestamps, not executable content.
13. CAPTCHA uses a managed challenge abstraction, initially Cloudflare Turnstile, with mandatory server-side verification, action/hostname checks, bounded timeouts, replay resistance, rate limits, security events, test keys, accessible failure/retry, and fail-closed production behaviour. Missing production keys remain an explicit readiness blocker.
14. Client portal custom domains use verified host bindings. `portal.clientdomain.com` is the universal route. `clientdomain.com/aqua` is supported only when the client’s existing origin/CDN can reverse-proxy that path; DNS alone cannot split a path.
15. Connections must have an in-app setup/status/action path with plain-language copy. External credentials may still require the provider’s secure consent screen; secrets are never echoed back.
16. The login screenshot supplied by Ed is a visual problem statement, not a design specification. The replacement must retain neutral/brand-safe tenancy, MFA, password recovery, keyboard/accessibility, reduced motion, and policies.
17. Ed explicitly instructed “don't do live” on 12 September 2026. Railway, Supabase cloud, DNS, providers, production data, credentials, deployment and live-containment mutations remain prohibited without a later exact authorisation. Ed subsequently authorised scanned GitHub preservation checkpoints to `https://github.com/edstorm987/aquacrm.git` and a future non-force `main` promotion only after the full documented gate passes. Codex is the sole Git custodian; workers never push. Read-only checks may be recorded, but no further live probing is needed for the local build programme.
