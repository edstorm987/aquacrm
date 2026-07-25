// Re-export surface for the @aqua/plugin-domains/server entrypoint.
//
// The foundation imports the registration helper + types from this
// path. Plugin-internal modules (handlers, pages) import from the
// nested files directly to keep the public surface narrow.

export {
  registerDomainsFoundation,
  clearDomainsFoundation,
  isFoundationRegistered,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
  type DomainsFoundation,
  type DomainsContainer,
} from "./foundationAdapter";

export {
  DomainService,
  type DomainServiceContext,
  type AttachServiceResult,
  type VerifyServiceResult,
} from "./domainService";

export {
  attachDomain,
  verifyDomain,
  removeDomain,
  isConfigured,
  type AttachDomainResult,
  type VercelClientConfig,
} from "./vercelClient";

export type {
  TenantPort,
  ActivityLogPort,
  EventBusPort,
  PluginInstallStorePort,
  LogActivityInput,
  ListActivityFilter,
  DomainsEventName,
} from "./ports";

export { DomainStore } from "./domainStore";
