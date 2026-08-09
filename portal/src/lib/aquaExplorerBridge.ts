export const AQUA_EXPLORER_PROTOCOL_VERSION = 1 as const;

export const AQUA_EXPLORER_MESSAGES = {
  ping: "aqua-explorer:ping",
  ready: "aqua-explorer:ready",
  inspect: "aqua-explorer:inspect",
  diagnostics: "aqua-explorer:diagnostics",
  enable: "aqua-explorer:enable",
  disable: "aqua-explorer:disable",
  selected: "aqua-explorer:selected",
  patch: "aqua-explorer:patch",
  reset: "aqua-explorer:reset",
} as const;

export interface AquaExplorerCapabilities {
  inspect: boolean;
  visualEditing: boolean;
  editableElements: number;
}

export interface AquaExplorerElement {
  id: string;
  tagName: string;
  kind: "text" | "image";
  label: string;
  text?: string;
  src?: string;
  alt?: string;
  styles: {
    color: string;
    backgroundColor: string;
    fontSize: string;
    fontWeight: string;
    textAlign: string;
  };
}

export interface AquaExplorerPatch {
  text?: string;
  src?: string;
  alt?: string;
  styles?: Partial<AquaExplorerElement["styles"]>;
}

export interface AquaExplorerReadyMessage {
  type: typeof AQUA_EXPLORER_MESSAGES.ready;
  version: typeof AQUA_EXPLORER_PROTOCOL_VERSION;
  requestId: string;
  propertyId: string;
  path: string;
  title: string;
  capabilities: AquaExplorerCapabilities;
}

export interface AquaExplorerDiagnostics {
  path: string;
  title: string;
  readyState: DocumentReadyState;
  viewport: { width: number; height: number };
  document: { width: number; height: number };
  counts: {
    editableElements: number;
    forms: number;
    images: number;
    links: number;
    resources: number;
  };
  performance: {
    responseMs?: number;
    domContentLoadedMs?: number;
    loadMs?: number;
    firstContentfulPaintMs?: number;
  };
  connection?: {
    effectiveType?: string;
    downlinkMbps?: number;
    saveData?: boolean;
  };
  recentErrors: string[];
}

export interface AquaExplorerDiagnosticsMessage {
  type: typeof AQUA_EXPLORER_MESSAGES.diagnostics;
  version: typeof AQUA_EXPLORER_PROTOCOL_VERSION;
  requestId: string;
  diagnostics: AquaExplorerDiagnostics;
}

export interface AquaExplorerSelectedMessage {
  type: typeof AQUA_EXPLORER_MESSAGES.selected;
  version: typeof AQUA_EXPLORER_PROTOCOL_VERSION;
  element: AquaExplorerElement | null;
}

export function isAquaExplorerReadyMessage(value: unknown): value is AquaExplorerReadyMessage {
  if (!isRecord(value) || value.type !== AQUA_EXPLORER_MESSAGES.ready) return false;
  return value.version === AQUA_EXPLORER_PROTOCOL_VERSION
    && typeof value.requestId === "string"
    && typeof value.propertyId === "string"
    && typeof value.path === "string"
    && typeof value.title === "string"
    && isRecord(value.capabilities)
    && typeof value.capabilities.inspect === "boolean"
    && typeof value.capabilities.visualEditing === "boolean"
    && typeof value.capabilities.editableElements === "number";
}

export function isAquaExplorerDiagnosticsMessage(value: unknown): value is AquaExplorerDiagnosticsMessage {
  if (!isRecord(value) || value.type !== AQUA_EXPLORER_MESSAGES.diagnostics) return false;
  return value.version === AQUA_EXPLORER_PROTOCOL_VERSION
    && typeof value.requestId === "string"
    && isRecord(value.diagnostics)
    && typeof value.diagnostics.path === "string"
    && typeof value.diagnostics.title === "string"
    && isRecord(value.diagnostics.viewport)
    && isRecord(value.diagnostics.counts)
    && Array.isArray(value.diagnostics.recentErrors);
}

export function isAquaExplorerSelectedMessage(value: unknown): value is AquaExplorerSelectedMessage {
  if (!isRecord(value) || value.type !== AQUA_EXPLORER_MESSAGES.selected) return false;
  if (value.version !== AQUA_EXPLORER_PROTOCOL_VERSION) return false;
  if (value.element === null) return true;
  if (!isRecord(value.element) || !isRecord(value.element.styles)) return false;
  return typeof value.element.id === "string"
    && typeof value.element.tagName === "string"
    && (value.element.kind === "text" || value.element.kind === "image")
    && typeof value.element.label === "string"
    && typeof value.element.styles.color === "string"
    && typeof value.element.styles.backgroundColor === "string"
    && typeof value.element.styles.fontSize === "string"
    && typeof value.element.styles.fontWeight === "string"
    && typeof value.element.styles.textAlign === "string";
}

export function explorerTargetOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "*";
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object";
}
