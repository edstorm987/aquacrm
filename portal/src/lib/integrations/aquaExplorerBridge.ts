/**
 * The Project Explorer's names for the Aqua Tag protocol.
 *
 * This file used to be a SECOND hand-written copy of the message names, the
 * payload shapes and the validators — the tag source had one set of string
 * literals, this had another, and nothing checked that they agreed. That is
 * precisely how the Dev editor ended up listening for a message the tag has
 * never sent.
 *
 * There is now one definition, in
 * `src/engines/editor/editing/aquaTagBridge.ts`, held in agreement with the
 * tag by `scripts/smoke-aqua-tag-bridge.test.ts`. This file keeps the older
 * `AquaExplorer*` spelling so the Project Explorer and its tests carry on
 * working, but it declares nothing of its own.
 *
 * New code should import from the bridge directly. Nothing new should be added
 * here — adding a type here rather than there rebuilds the exact duplication
 * this file was collapsed to remove.
 */

import {
  AQUA_TAG_MESSAGES,
  AQUA_TAG_PROTOCOL_VERSION,
  aquaTagOrigin,
  parseAquaTagMessage,
  type AquaTagCapabilities,
  type AquaTagDiagnostics,
  type AquaTagDiagnosticsMessage,
  type AquaTagElement,
  type AquaTagPatch,
  type AquaTagReadyMessage,
  type AquaTagSelectedMessage,
} from "@/engines/editor/editing/aquaTagBridge";

export const AQUA_EXPLORER_PROTOCOL_VERSION = AQUA_TAG_PROTOCOL_VERSION;
export const AQUA_EXPLORER_MESSAGES = AQUA_TAG_MESSAGES;

export type AquaExplorerCapabilities = AquaTagCapabilities;
export type AquaExplorerElement = AquaTagElement;
export type AquaExplorerPatch = AquaTagPatch;
export type AquaExplorerReadyMessage = AquaTagReadyMessage;
export type AquaExplorerDiagnostics = AquaTagDiagnostics;
export type AquaExplorerDiagnosticsMessage = AquaTagDiagnosticsMessage;
export type AquaExplorerSelectedMessage = AquaTagSelectedMessage;

export function isAquaExplorerReadyMessage(value: unknown): value is AquaExplorerReadyMessage {
  return parseAquaTagMessage(value)?.type === AQUA_TAG_MESSAGES.ready;
}

export function isAquaExplorerDiagnosticsMessage(value: unknown): value is AquaExplorerDiagnosticsMessage {
  return parseAquaTagMessage(value)?.type === AQUA_TAG_MESSAGES.diagnostics;
}

export function isAquaExplorerSelectedMessage(value: unknown): value is AquaExplorerSelectedMessage {
  return parseAquaTagMessage(value)?.type === AQUA_TAG_MESSAGES.selected;
}

/**
 * @deprecated Falls back to `"*"`, which posts the payload to whatever page
 * now occupies the frame. Use `aquaTagOrigin`, which returns null instead and
 * leaves the caller to do the only safe thing with an unknown origin: not
 * send. Kept unchanged only so the Project Explorer's current behaviour is not
 * altered by a protocol refactor; replacing the call sites is its own change.
 */
export function explorerTargetOrigin(url: string): string {
  return aquaTagOrigin(url) ?? "*";
}
