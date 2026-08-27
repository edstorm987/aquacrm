export type AccessEnvironment = "live" | "sandbox";

export type AccessScopeKind = "agency" | "workspace" | "client" | "project";

export interface AccessScope {
  kind: AccessScopeKind;
  id: string;
  clientId?: string;
  projectId?: string;
}

export interface NamedAccessScope extends AccessScope {
  label: string;
}

export type ElementAccessLevel = "hidden" | "view" | "use" | "manage";

export interface AccessPerson {
  id: string;
  name: string;
  email?: string;
  detail?: string;
}

export interface AccessRoleTemplate {
  id: string;
  name: string;
  description?: string;
  capabilities: string[];
  allowedScopeKinds: AccessScopeKind[];
  allowedEnvironments: AccessEnvironment[];
  archivedAt?: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface AccessGrant {
  id: string;
  userId: string;
  scope: AccessScope;
  environment: AccessEnvironment;
  capabilities: string[];
  templateId?: string;
  expiresAt?: number;
  reason?: string;
  revokedAt?: number;
  createdAt?: number;
}

export type AccessRequestStatus = "pending" | "approved" | "denied" | "cancelled" | "expired";

export interface AccessRequest {
  id: string;
  requesterUserId: string;
  requesterName?: string;
  requesterEmail?: string;
  scope: AccessScope;
  environment: AccessEnvironment;
  requestedCapabilities: string[];
  reason: string;
  requestedExpiresAt?: number;
  status: AccessRequestStatus;
  approvedCapabilities?: string[];
  decisionReason?: string;
  decidedAt?: number;
  createdAt?: number;
  grantId?: string;
}

export interface BaseCapabilityDefinition {
  key: string;
  label: string;
  detail: string;
  group: "Workspace" | "Project" | "Access control";
  scopeKinds: AccessScopeKind[];
}

export interface ElementCapabilityDefinition {
  key: string;
  label: string;
  detail: string;
  group: "Workspace" | "Staff" | "Fulfilment" | "Client" | "Development" | "Project";
  scopeKinds: AccessScopeKind[];
}

export const BASE_CAPABILITIES: readonly BaseCapabilityDefinition[] = [
  { key: "workspace.view", label: "Open workspace", detail: "See the workspace shell and permitted navigation.", group: "Workspace", scopeKinds: ["agency", "workspace", "client"] },
  { key: "workspace.manage", label: "Manage workspace", detail: "Change workspace-wide configuration and working data.", group: "Workspace", scopeKinds: ["agency", "workspace", "client"] },
  { key: "project.view", label: "Open project", detail: "See the project, its status and permitted project surfaces.", group: "Project", scopeKinds: ["project"] },
  { key: "project.manage", label: "Manage project settings", detail: "Change project membership and governed project settings, excluding repository credentials and bindings.", group: "Project", scopeKinds: ["project"] },
  { key: "project.connection.manage", label: "Manage repository connection", detail: "Change this project's repository, branch and bound GitHub or Vercel connection.", group: "Project", scopeKinds: ["project"] },
  { key: "project.edit", label: "Edit project", detail: "Change project source or project-owned working data.", group: "Project", scopeKinds: ["project"] },
  { key: "project.ai", label: "Use project AI", detail: "Ask project-scoped AI to inspect or propose changes.", group: "Project", scopeKinds: ["project"] },
  { key: "project.preview", label: "Open project preview", detail: "Open and view the project preview surface.", group: "Project", scopeKinds: ["project"] },
  { key: "dev.project.run_local", label: "Control local preview", detail: "Start, stop and restart the supervised repository preview process.", group: "Project", scopeKinds: ["project"] },
  { key: "dev.project.logs", label: "Read preview logs", detail: "Inspect the supervised preview process output without receiving shell access.", group: "Project", scopeKinds: ["project"] },
  { key: "project.pull-request", label: "Create pull request", detail: "Prepare project changes for review without publishing them.", group: "Project", scopeKinds: ["project"] },
  { key: "project.publish", label: "Publish project", detail: "Promote approved changes to the configured release target.", group: "Project", scopeKinds: ["project"] },
  { key: "project.deploy", label: "Deploy project", detail: "Run the project deployment lifecycle.", group: "Project", scopeKinds: ["project"] },
  { key: "access.request", label: "Request access", detail: "Ask an authorised reviewer for a precisely scoped grant.", group: "Access control", scopeKinds: ["agency", "workspace", "client", "project"] },
  { key: "access.grant.manage", label: "Manage grants", detail: "Assign or revoke access for people within this scope.", group: "Access control", scopeKinds: ["agency", "workspace", "client", "project"] },
  { key: "access.template.manage", label: "Manage role templates", detail: "Create and maintain reusable role templates.", group: "Access control", scopeKinds: ["agency", "workspace"] },
  { key: "access.request.review", label: "Review requests", detail: "Approve a requested subset or deny a request.", group: "Access control", scopeKinds: ["agency", "workspace", "client", "project"] },
  { key: "access.audit.view", label: "View access audit", detail: "See attributable access changes and decisions.", group: "Access control", scopeKinds: ["agency", "workspace", "client", "project"] },
] as const;

export const ELEMENT_CAPABILITIES: readonly ElementCapabilityDefinition[] = [
  { key: "workspace.overview", label: "Workspace overview", detail: "Dashboard, summaries and workspace status.", group: "Workspace", scopeKinds: ["agency", "workspace", "client"] },
  { key: "workspace.actions", label: "Actions", detail: "Assigned tasks, decisions and working actions.", group: "Workspace", scopeKinds: ["agency", "workspace", "client"] },
  { key: "workspace.calendar", label: "Calendar", detail: "Shared schedule, appointments and deadlines.", group: "Workspace", scopeKinds: ["agency", "workspace", "client"] },
  { key: "workspace.inbox", label: "Inbox", detail: "Workspace communications and reply controls.", group: "Workspace", scopeKinds: ["agency", "workspace", "client"] },
  { key: "workspace.files", label: "Files", detail: "Workspace-owned documents, assets and downloads.", group: "Workspace", scopeKinds: ["agency", "workspace", "client"] },
  { key: "workspace.settings", label: "Workspace settings", detail: "Configuration visible inside this workspace.", group: "Workspace", scopeKinds: ["agency", "workspace", "client"] },
  { key: "staff.overview", label: "Staff overview", detail: "People headline metrics and operational summaries.", group: "Staff", scopeKinds: ["agency", "workspace"] },
  { key: "staff.people", label: "People directory", detail: "Team identities, profiles and organisation view.", group: "Staff", scopeKinds: ["agency", "workspace"] },
  { key: "staff.schedule", label: "Schedule and leave", detail: "Shifts, availability and leave records.", group: "Staff", scopeKinds: ["agency", "workspace"] },
  { key: "staff.training", label: "Staff training", detail: "Onboarding, training and progression.", group: "Staff", scopeKinds: ["agency", "workspace"] },
  { key: "staff.pay", label: "Pay and commission", detail: "Sensitive compensation and commission surfaces.", group: "Staff", scopeKinds: ["agency", "workspace"] },
  { key: "staff.chat", label: "Team chat", detail: "Internal team communication.", group: "Staff", scopeKinds: ["agency", "workspace"] },
  { key: "fulfilment.overview", label: "Fulfilment overview", detail: "Delivery health, attention and flow summaries.", group: "Fulfilment", scopeKinds: ["agency", "workspace", "client"] },
  { key: "fulfilment.services", label: "Services", detail: "Service definitions and active client delivery.", group: "Fulfilment", scopeKinds: ["agency", "workspace", "client"] },
  { key: "fulfilment.projects", label: "Projects", detail: "Technical and non-technical delivery projects.", group: "Fulfilment", scopeKinds: ["agency", "workspace", "client", "project"] },
  { key: "fulfilment.portals", label: "Portals", detail: "Client portal library and configuration.", group: "Fulfilment", scopeKinds: ["agency", "workspace", "client"] },
  { key: "fulfilment.tags", label: "Aqua Tags", detail: "Tracking keys, snippets and tag status.", group: "Fulfilment", scopeKinds: ["agency", "workspace", "client", "project"] },
  { key: "client.overview", label: "Client overview", detail: "Client workspace summary, health and current status.", group: "Client", scopeKinds: ["agency", "client"] },
  { key: "client.relationship", label: "Client relationship", detail: "Relationship context, contacts and onboarding journey.", group: "Client", scopeKinds: ["agency", "client"] },
  { key: "client.fulfilment", label: "Client fulfilment", detail: "Assigned services, delivery plan and client work board.", group: "Client", scopeKinds: ["agency", "client"] },
  { key: "client.marketing", label: "Client marketing", detail: "Social profiles, content and campaign delivery.", group: "Client", scopeKinds: ["agency", "client"] },
  { key: "client.systems", label: "Client systems", detail: "Websites, properties, integrations and installed client tools.", group: "Client", scopeKinds: ["agency", "client"] },
  { key: "client.commercial", label: "Client commercial", detail: "Invoices, agreements, payment plans and commercial health.", group: "Client", scopeKinds: ["agency", "client"] },
  { key: "client.communications", label: "Client communications", detail: "Client messages, requests and relationship correspondence.", group: "Client", scopeKinds: ["agency", "client"] },
  { key: "client.files", label: "Client files", detail: "Client-owned documents, evidence and deliverables.", group: "Client", scopeKinds: ["agency", "client"] },
  { key: "client.portal", label: "Client portal", detail: "Client-facing portal preview, access and connections.", group: "Client", scopeKinds: ["agency", "client"] },
  { key: "client.record", label: "Client record", detail: "Internal record, ledger, notes and linked evidence.", group: "Client", scopeKinds: ["agency", "client"] },
  { key: "client.settings", label: "Client settings", detail: "Client identity, domains, fields, status and lifecycle controls.", group: "Client", scopeKinds: ["agency", "client"] },
  { key: "development.overview", label: "Development overview", detail: "Project portfolio, health and development status.", group: "Development", scopeKinds: ["project"] },
  { key: "development.preview", label: "Preview", detail: "Project preview surface and device controls.", group: "Development", scopeKinds: ["project"] },
  { key: "development.explorer", label: "Visual explorer", detail: "Inspect and select supported preview elements.", group: "Development", scopeKinds: ["project"] },
  { key: "development.code", label: "Code workspace", detail: "Repository files, code editing and project commands.", group: "Development", scopeKinds: ["project"] },
  { key: "development.ai", label: "Development AI", detail: "Project-scoped AI inspection and proposal controls.", group: "Development", scopeKinds: ["project"] },
  { key: "development.publish", label: "Publish controls", detail: "Pull-request, publish and deployment controls.", group: "Development", scopeKinds: ["project"] },
  { key: "project.overview", label: "Project overview", detail: "Project summary, status and important context.", group: "Project", scopeKinds: ["project"] },
  { key: "project.tasks", label: "Project tasks", detail: "Project-specific work and decisions.", group: "Project", scopeKinds: ["project"] },
  { key: "project.files", label: "Project files", detail: "Project documents, assets and repository files.", group: "Project", scopeKinds: ["project"] },
  { key: "project.messages", label: "Project messages", detail: "Project discussions and communication history.", group: "Project", scopeKinds: ["project"] },
  { key: "project.editor", label: "Project editor", detail: "Editing tools owned by this project.", group: "Project", scopeKinds: ["project"] },
] as const;

export const ELEMENT_LEVELS: readonly ElementAccessLevel[] = ["hidden", "view", "use", "manage"];

/**
 * Workspace scope kinds are shared by Staff and Fulfilment, but their exact
 * scope ids are separate authority boundaries. Agency, client and project
 * scopes intentionally keep their existing registry-based visibility.
 */
export function elementAvailableForExactScope(
  definition: ElementCapabilityDefinition,
  scope: AccessScope,
): boolean {
  if (!definition.scopeKinds.includes(scope.kind)) return false;
  if (scope.kind !== "workspace") return true;
  if (scope.id === "staff") return definition.group === "Workspace" || definition.group === "Staff";
  if (scope.id === "fulfilment") return definition.group === "Workspace" || definition.group === "Fulfilment";
  return true;
}

export function capabilityAvailableForExactScope(capability: string, scope: AccessScope): boolean {
  const base = BASE_CAPABILITIES.find(definition => definition.key === capability);
  if (base) return base.scopeKinds.includes(scope.kind);

  const elementMatch = /^element\.(.+)\.(view|use|manage)$/.exec(capability);
  if (!elementMatch) return false;
  const definition = ELEMENT_CAPABILITIES.find(item => item.key === elementMatch[1]);
  return definition ? elementAvailableForExactScope(definition, scope) : false;
}

export function narrowCapabilitiesToExactScope(capabilities: readonly string[], scope: AccessScope): string[] {
  return capabilities.filter(capability => capabilityAvailableForExactScope(capability, scope));
}

export function elementCapability(elementKey: string, level: Exclude<ElementAccessLevel, "hidden">): string {
  return `element.${elementKey}.${level}`;
}

export function isElementCapability(capability: string): boolean {
  return /^element\.[a-z0-9][a-z0-9.-]*\.(view|use|manage)$/.test(capability);
}

export function elementAccessLevel(capabilities: readonly string[], elementKey: string): ElementAccessLevel {
  if (capabilities.includes(elementCapability(elementKey, "manage"))) return "manage";
  if (capabilities.includes(elementCapability(elementKey, "use"))) return "use";
  if (capabilities.includes(elementCapability(elementKey, "view"))) return "view";
  return "hidden";
}

export function setElementAccessLevel(capabilities: readonly string[], elementKey: string, level: ElementAccessLevel): string[] {
  const elementPrefix = `element.${elementKey}.`;
  const next = capabilities.filter(capability => !capability.startsWith(elementPrefix));
  if (level !== "hidden") next.push(elementCapability(elementKey, level));
  return [...new Set(next)].sort();
}

export function capabilityImplies(capabilities: readonly string[], requiredCapability: string): boolean {
  if (capabilities.includes(requiredCapability)) return true;
  const match = /^element\.(.+)\.(view|use|manage)$/.exec(requiredCapability);
  if (!match) return false;
  const [, key, level] = match;
  const current = elementAccessLevel(capabilities, key!);
  const rank: Record<ElementAccessLevel, number> = { hidden: 0, view: 1, use: 2, manage: 3 };
  return rank[current] >= rank[level as ElementAccessLevel];
}

export function sameScope(left: AccessScope, right: AccessScope): boolean {
  return left.kind === right.kind
    && left.id === right.id
    && (left.clientId ?? "") === (right.clientId ?? "")
    && (left.projectId ?? "") === (right.projectId ?? "");
}

/**
 * Keep the owner review queue inside the exact scopes the server-rendered
 * surface disclosed. Requesters only see the active exact scope; their API
 * response is self-only as an additional server-side boundary.
 */
export function visibleAccessRequestsForScopes(
  requests: readonly AccessRequest[],
  environment: AccessEnvironment,
  choices: readonly NamedAccessScope[],
  activeScope: AccessScope,
  canManage: boolean,
): AccessRequest[] {
  return requests.filter(request => {
    if (request.environment !== environment) return false;
    return canManage
      ? choices.some(choice => sameScope(choice, request.scope))
      : sameScope(request.scope, activeScope);
  });
}

export function buildAgencyAccessScopeChoices(input: {
  agencyId: string;
  clients: readonly { id: string; name: string }[];
  devProjects: readonly { id: string; name: string }[];
  canManageProjectAccess: boolean;
}): NamedAccessScope[] {
  return [
    { kind: "agency", id: input.agencyId, label: "Whole agency" },
    { kind: "workspace", id: "staff", label: "Staff workspace" },
    { kind: "workspace", id: "fulfilment", label: "Fulfilment workspace" },
    ...input.clients.map(client => ({ kind: "client" as const, id: client.id, label: `Client · ${client.name}` })),
    ...(input.canManageProjectAccess
      ? input.devProjects.map(project => ({ kind: "project" as const, id: project.id, label: `Dev project · ${project.name}` }))
      : []),
  ];
}

export function scopeLabel(scope: AccessScope, choices: readonly NamedAccessScope[] = []): string {
  return choices.find(choice => sameScope(choice, scope))?.label
    ?? `${scope.kind.charAt(0).toUpperCase()}${scope.kind.slice(1)} · ${scope.id}`;
}

export function dateTimeLocalValue(timestamp?: number): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(timestamp - offset).toISOString().slice(0, 16);
}

export function parseExpiry(value: string): number | undefined {
  if (!value) return undefined;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function requestStatus(value: unknown): AccessRequestStatus {
  return value === "approved" || value === "denied" || value === "cancelled" || value === "expired" ? value : "pending";
}
