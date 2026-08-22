# `src/engines/editor/editing/aquaTagBridge.ts`

← [File index](../../../../../files-index.md) · Area: Other

**What it is:** The one contract between the Aqua Tag and the editor. The tag is the thing that has mapped a page: connect it, press Map, and a click on the live site resolves to an exact element. Everything the editor does with a selection — show the words, hand it to the assistant, drop it into the builder, jump to its file — is downstream of that one message arriving intact. There is only ever ONE selection mechanism; what changes per mode is only where the selection is sent. ── Why this module exists ────────────────────────────────────────────────── The two halves drifted because the contract was written twice, as bare string literals, with nothing tying them together. The tag posts `aqua-explorer:selected`; the Dev editor listened for `aqua:portal-block-select` and dropped everything else on the floor. Both were "correct" in their own file and nothing could ever have told anybody they disagreed. So this file is the single definition of the protocol for every TypeScript consumer. Import the constants and the parser from here; do not retype a message name as a literal anywhere else, because a literal is exactly how the last drift happened. The tag itself CANNOT import this — `aquaTagSource.ts` is a template string of browser JavaScript served at `/aqua-tag.js`, so it has no module system and no types. That half is held in agreement by a test instead: `scripts/smoke-aqua-tag-bridge.test.ts` reads the tag source and asserts its literals, its protocol version, and the exact field list built by `explorerDescribe` all match the declarations below. If you change one side, that test fails until you change the other. That is the drift guard — please do not weaken it. Client-safe on purpose: no server imports, no Node built-ins, no `next/*`. It runs inside the editor in the browser. Bumped only when the shape below changes incompatibly. The tag checks this on EVERY inbound message and silently returns when it disagrees, so an editor→tag message without a matching `version` is not an error — it is silence, which is far harder to debug. That is why every outbound builder in this file sets it for you.

## Exports (59)

- `AQUA_TAG_PROTOCOL_VERSION`
- `AQUA_TAG_MESSAGES`
- `type AquaTagMessageName`
- `AQUA_TAG_STYLE_PROPERTIES`
- `type AquaTagStyleProperty`
- `type AquaTagElementStyles`
- `interface AquaTagElement (8 members)`
- `AQUA_TAG_ELEMENT_FIELDS`
- `interface AquaTagPatch (4 members)`
- `interface AquaTagCapabilities (4 members)`
- `interface AquaTagThrottleProfile (3 members)`
- `interface AquaTagDiagnostics (9 members)`
- `interface AquaTagReadyMessage (7 members)`
- `interface AquaTagDiagnosticsMessage (4 members)`
- `interface AquaTagSelectedMessage (3 members)`
- `interface AquaTagThrottleAppliedMessage (3 members)`
- `interface AquaTagPageLink (2 members)`
- `interface AquaTagLinksMessage (4 members)`
- `type AquaTagInboundMessage`
- `AQUA_TAG_READY_FIELDS`
- `AQUA_TAG_CAPABILITY_FIELDS`
- `AQUA_TAG_THROTTLE_APPLIED_FIELDS`
- `AQUA_TAG_THROTTLE_PROFILE_FIELDS`
- `AQUA_TAG_DIAGNOSTICS_MESSAGE_FIELDS`
- `AQUA_TAG_DIAGNOSTICS_FIELDS`
- `AQUA_TAG_COUNT_FIELDS`
- `AQUA_TAG_PERFORMANCE_FIELDS`
- `AQUA_TAG_CONNECTION_FIELDS`
- `AQUA_TAG_SELECTED_FIELDS`
- `AQUA_TAG_LINKS_MESSAGE_FIELDS`
- `AQUA_TAG_PAGE_LINK_FIELDS`
- `AQUA_TAG_SIZE_FIELDS`
- `interface AquaTagPingMessage (3 members)`
- `interface AquaTagInspectMessage (3 members)`
- `interface AquaTagLinksRequestMessage (3 members)`
- `interface AquaTagEnableMessage (2 members)`
- `interface AquaTagDisableMessage (2 members)`
- `interface AquaTagPatchMessage (4 members)`
- `interface AquaTagResetMessage (2 members)`
- `interface AquaTagThrottleMessage (3 members)`
- `type AquaTagOutboundMessage`
- `aquaTagPing(requestId: string): AquaTagPingMessage`
- `aquaTagInspect(requestId: string): AquaTagInspectMessage`
- `aquaTagLinks(requestId: string): AquaTagLinksRequestMessage`
- `aquaTagEnable(): AquaTagEnableMessage`
- `aquaTagDisable(): AquaTagDisableMessage`
- `aquaTagPatchMessage(elementId: string, patch: AquaTagPatch): AquaTagPatchMessage`
- `aquaTagReset(): AquaTagResetMessage`
- `aquaTagThrottle(profile: AquaTagThrottleProfile | null): AquaTagThrottleMessage`
- `parseAquaTagElement(value: unknown): AquaTagElement | null`
- `parseAquaTagThrottleProfile(value: unknown): AquaTagThrottleProfile | null`
- `parseAquaTagMessage(data: unknown): AquaTagInboundMessage | null`
- `aquaTagOrigin(frameUrl: string | null | undefined, base?: string | null): string | null`
- `interface AquaTagBrowserTarget (2 members)`
- `aquaTagBrowserUrl(project: AquaTagBrowserTarget | null | undefined): string`
- `interface AquaTagOriginPolicy (2 members)`
- `interface AquaTagMessageEnvelope (3 members)`
- `isAquaTagMessageTrusted(event: AquaTagMessageEnvelope, policy: AquaTagOriginPolicy): boolean`
- `acceptAquaTagMessage(event: AquaTagMessageEnvelope, policy: AquaTagOriginPolicy): AquaTagInboundMessage | null`

## Used by (7)

- [`scripts/smoke-aqua-tag-bridge.test.ts`](../../../../scripts/smoke-aqua-tag-bridge.test.md)
- [`scripts/smoke-dev-editor-tag-bridge.test.ts`](../../../../scripts/smoke-dev-editor-tag-bridge.test.md)
- [`src/app/portal/dev-team/editor/studio/page.tsx`](../../../app/portal/dev-team/editor/studio/page.md)
- [`src/components/editing/NetworkThrottleControl.tsx`](../../../components/editing/NetworkThrottleControl.md)
- [`src/engines/editor/DevEditor.tsx`](../DevEditor.md)
- [`src/engines/editor/editing/pageNavigator.ts`](./pageNavigator.md)
- [`src/lib/integrations/aquaExplorerBridge.ts`](../../../lib/integrations/aquaExplorerBridge.md)

