// The complete deployable-route inventory for the 2026-09-08 UI/UX acceptance
// phase. Every `page.tsx` under `src/app` is accounted for. Dynamic ([param] /
// [...rest]) routes are marked `status: "skip"` for the AUTOMATED run because they
// need representative fixtures; they are still counted in the inventory and are
// covered by targeted fixture walks + the human report.
//
// `role`: which /dev persona reaches it (owner = /dev, staff = /dev?as=staff,
// customer = /dev?client=<id>, freelancer = /dev?as=freelancer). `needsAuth`:
// whether an unauthenticated hit should NOT show the page.

const def = (paths, meta) => paths.map(path => ({ path, ...meta }));

export const ROUTES = [
  // ── Public website & marketing ──
  ...def(["/", "/business-os", "/careers", "/client-centre", "/demo-privacy",
    "/for-agencies", "/health-check", "/milesymedia", "/milesymedia/contact",
    "/portfolio", "/portfolio/beast-commerce", "/portfolio/ocean-boulevard",
    "/resources", "/terms", "/tools"],
    { category: "public", needsAuth: false, role: "anon" }),

  // ── Auth / onboarding / connection ──
  ...def(["/login", "/login/forgot", "/login/magic", "/login/reset", "/setup"],
    { category: "auth", needsAuth: false, role: "anon" }),
  ...def(["/connect/[connectionId]", "/embed/account", "/proposal/[token]", "/careers/status/[token]"],
    { category: "auth", needsAuth: false, role: "anon", status: "skip", skipReason: "dynamic/token fixture" }),

  // ── Agency Command Centre & Operations (owner) ──
  ...def(["/portal", "/portal/agency", "/portal/agency/actions", "/portal/agency/activity-inbox",
    "/portal/agency/assistant", "/portal/agency/automations", "/portal/agency/calendar",
    "/portal/agency/command-center", "/portal/agency/company", "/portal/agency/governance",
    "/portal/agency/inbox", "/portal/agency/marketing", "/portal/agency/meetings",
    "/portal/agency/my-radar", "/portal/agency/notepad", "/portal/agency/operations",
    "/portal/agency/people", "/portal/agency/performance", "/portal/agency/phases",
    "/portal/agency/radar", "/portal/agency/radar/workload", "/portal/agency/tools",
    "/portal/agency/you-deserve-it"],
    { category: "agency", needsAuth: true, role: "owner" }),

  // ── Contacts / organisations (owner) ──
  ...def(["/portal/agency/contacts"], { category: "contacts", needsAuth: true, role: "owner" }),
  ...def(["/portal/agency/contacts/[personId]", "/portal/agency/contacts/companies/[organisationId]"],
    { category: "contacts", needsAuth: true, role: "owner", status: "skip", skipReason: "dynamic fixture" }),

  // ── Clients ──
  ...def(["/portal/clients"], { category: "clients", needsAuth: true, role: "owner" }),
  ...def(["/portal/clients/[clientId]", "/portal/clients/[clientId]/[...rest]",
    "/portal/clients/[clientId]/pages/[pageId]", "/portal/clients/[clientId]/popups",
    "/portal/clients/[clientId]/sections", "/portal/clients/[clientId]/settings",
    "/portal/clients/[clientId]/sites"],
    { category: "clients", needsAuth: true, role: "owner", status: "skip", skipReason: "dynamic client fixture" }),

  // ── Documents, SOPs, governance, finance, products (owner) ──
  ...def(["/portal/agency/sops", "/portal/agency/sop-library", "/portal/agency/products",
    "/portal/agency/settings"],
    { category: "settings-finance", needsAuth: true, role: "owner" }),
  ...def(["/portal/agency/products/[productId]"], { category: "settings-finance", needsAuth: true, role: "owner", status: "skip", skipReason: "dynamic fixture" }),

  // ── Marketing / funnels / portals / website editor (owner) ──
  ...def(["/portal/agency/portals", "/portal/agency/portals/editor", "/portal/agency/portals/forms"],
    { category: "marketing-editor", needsAuth: true, role: "owner" }),
  ...def(["/portal/agency/pipelines/[slug]", "/portal/agency/phases/[phaseId]", "/portal/agency/portals/demo/[template]", "/portal/agency/[...rest]"],
    { category: "marketing-editor", needsAuth: true, role: "owner", status: "skip", skipReason: "dynamic fixture" }),

  // ── Development / dev workspace under agency (owner) ──
  ...def(["/portal/agency/development", "/portal/agency/development/code",
    "/portal/agency/development/performance", "/portal/agency/development/toolkit",
    "/portal/agency/development/vault", "/portal/agency/development/website",
    "/portal/agency/development/workflow", "/portal/agency/dev-docs",
    "/portal/agency/freelancer-access", "/portal/agency/freelancers",
    "/portal/agency/fulfilment", "/portal/agency/fulfilment/technical/performance",
    "/portal/agency/fulfilment/technical/toolkit", "/portal/agency/fulfilment/technical/vault",
    "/portal/agency/fulfilment/technical/website", "/portal/agency/fulfilment/technical/workflow"],
    { category: "development", needsAuth: true, role: "owner" }),
  ...def(["/portal/agency/development/projects/[projectId]", "/portal/agency/fulfilment/technical/projects/[projectId]"],
    { category: "development", needsAuth: true, role: "owner", status: "skip", skipReason: "dynamic fixture" }),

  // ── Account & permissions (owner) ──
  ...def(["/portal/account", "/portal/account/permissions", "/portal/account/preferences"],
    { category: "account", needsAuth: true, role: "owner" }),

  // ── Dev Team (owner) ──
  ...def(["/portal/dev-team", "/portal/dev-team/api", "/portal/dev-team/auditor",
    "/portal/dev-team/chat", "/portal/dev-team/docs", "/portal/dev-team/editor",
    "/portal/dev-team/editor/studio", "/portal/dev-team/findings", "/portal/dev-team/inspector",
    "/portal/dev-team/library", "/portal/dev-team/logs", "/portal/dev-team/notes",
    "/portal/dev-team/plans/new", "/portal/dev-team/roadmap", "/portal/dev-team/tasks",
    "/portal/dev-team/tools", "/portal/dev-team/updates", "/portal/dev-team/working"],
    { category: "dev-team", needsAuth: true, role: "owner" }),
  ...def(["/portal/dev-workspace"], { category: "dev-team", needsAuth: true, role: "owner" }),
  ...def(["/portal/dev-workspace/[projectId]"], { category: "dev-team", needsAuth: true, role: "owner", status: "skip", skipReason: "dynamic fixture" }),

  // ── Team / freelancer / customer portals (role-specific) ──
  ...def(["/portal/team", "/portal/freelancer"], { category: "team-freelancer", needsAuth: true, role: "owner" }),
  ...def(["/portal/team/[section]"], { category: "team-freelancer", needsAuth: true, role: "owner", status: "skip", skipReason: "dynamic fixture" }),
  ...def(["/portal/customer", "/portal/customer/account", "/portal/customer/affiliate",
    "/portal/customer/bookings", "/portal/customer/membership", "/portal/customer/orders"],
    { category: "customer", needsAuth: true, role: "customer", status: "skip", skipReason: "needs ?client customer session (wave 2)" }),
  ...def(["/portal/customer/[...rest]"], { category: "customer", needsAuth: true, role: "customer", status: "skip", skipReason: "dynamic + customer session" }),

  // ── Previews (dynamic) ──
  ...def(["/client-preview/[clientId]", "/client-website-preview/[clientId]/[siteId]/[pageId]", "/portal/preview/[template]"],
    { category: "preview", needsAuth: true, role: "owner", status: "skip", skipReason: "dynamic preview fixture" }),
];

const dyn = ROUTES.filter(r => r.status === "skip").length;
export const ROUTE_TOTALS = {
  total: ROUTES.length,
  automated: ROUTES.filter(r => r.status !== "skip").length,
  skippedDynamic: dyn,
  categories: [...new Set(ROUTES.map(r => r.category))],
};
