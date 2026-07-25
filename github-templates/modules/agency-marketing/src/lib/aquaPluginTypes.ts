// Vendored AquaPlugin contract.

import type { ComponentType, ReactNode } from "react";

import type { AgencyId, ClientId, PluginInstall, UserId } from "./tenancy";

export type PluginCategory =
  | "core" | "content" | "commerce" | "marketing" | "support" | "ops" | "growth";
export type PluginStatus = "stable" | "beta" | "alpha";
export type ScopePolicy = "agency" | "client" | "either";

export interface PluginCtx {
  agencyId: AgencyId;
  clientId?: ClientId;
  install: PluginInstall;
  storage: PluginStorage;
  services: PluginServices;
  actor: UserId;
}

export interface PluginStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

export interface PluginServices {
  clients: unknown;
  pluginInstalls: unknown;
  pluginRuntime: unknown;
  registry: unknown;
  phases: unknown;
  activity: ActivityLogPort;
  events: EventBusPort;
  variants: unknown;
  tenant: TenantPort;
  user: UserPort;
}

import type {
  ActivityLogPort, EventBusPort, TenantPort, UserPort,
} from "../server/ports";

export interface SetupStep {
  id: string;
  title: string;
  description: string;
  fields: SetupField[];
  validate?(values: Record<string, string>): Promise<{ ok: true } | { ok: false; error: string }>;
  optional?: boolean;
}
export interface SetupField {
  id: string;
  label: string;
  type: "text" | "password" | "url" | "email" | "select" | "boolean" | "textarea";
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  helpText?: string;
}

export interface NavGroup { id: string; label: string; order?: number; }
export type PluginRoleVisibility =
  | "agency-owner" | "agency-manager" | "agency-staff"
  | "client-owner" | "client-staff" | "freelancer" | "end-customer";
export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon?: ReactNode;
  badge?: string | number;
  requiresFeature?: string;
  order?: number;
  panelId?: string;
  groupId?: string;
  parent?: string;
  visibleToRoles?: PluginRoleVisibility[];
}

export interface PluginPage {
  path: string;
  component: () => Promise<{ default: ComponentType<PluginPageProps> }>;
  requiresFeature?: string;
  title?: string;
}
export interface PluginPageProps {
  agencyId: AgencyId;
  clientId?: ClientId;
  install: PluginInstall;
  segments: string[];
  searchParams: Record<string, string | string[] | undefined>;
  actor: UserId;
  services: PluginServices;
  storage: PluginStorage;
}

export interface PluginApiRoute {
  path: string;
  methods: ("GET" | "POST" | "PATCH" | "PUT" | "DELETE")[];
  handler: (req: Request, ctx: PluginCtx) => Promise<Response>;
  requiresFeature?: string;
  visibleToRoles?: PluginRoleVisibility[];
  public?: boolean;
}

export interface SettingsSchema { customPage?: boolean; groups: SettingsGroup[]; }
export interface SettingsGroup {
  id: string;
  label: string;
  description?: string;
  fields: SettingsField[];
}
export interface SettingsField {
  id: string;
  label: string;
  type: "text" | "password" | "url" | "email" | "number" | "select" | "boolean" | "textarea" | "color";
  default?: string | number | boolean;
  options?: { value: string; label: string }[];
  helpText?: string;
  placeholder?: string;
}
export interface PluginFeature {
  id: string;
  label: string;
  description?: string;
  default: boolean;
  requires?: string[];
}

export interface HealthStatus {
  ok: boolean;
  message?: string;
  components?: Record<string, { ok: boolean; message?: string }>;
}

export interface AquaPlugin {
  id: string;
  name: string;
  version: string;
  status: PluginStatus;
  category: PluginCategory;
  tagline: string;
  description: string;
  icon?: ReactNode;
  core?: boolean;
  scopePolicy?: ScopePolicy;
  requires?: string[];
  conflicts?: string[];
  onInstall?: (ctx: PluginCtx, setupAnswers: Record<string, string>) => Promise<void>;
  onUninstall?: (ctx: PluginCtx) => Promise<void>;
  onEnable?: (ctx: PluginCtx) => Promise<void>;
  onDisable?: (ctx: PluginCtx) => Promise<void>;
  onConfigure?: (ctx: PluginCtx) => Promise<void>;
  setup?: SetupStep[];
  navGroup?: NavGroup;
  navItems: NavItem[];
  pages: PluginPage[];
  api: PluginApiRoute[];
  settings: SettingsSchema;
  features: PluginFeature[];
  healthcheck?: (ctx: PluginCtx) => Promise<HealthStatus>;
}
