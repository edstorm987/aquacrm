/**
 * The drift guard between the Aqua Tag and the editor.
 *
 * `src/lib/integrations/aquaTagSource.ts` is a template string of browser
 * JavaScript served at `/aqua-tag.js`. It has no module system, so it cannot
 * import the protocol module the way every TypeScript consumer does — which is
 * exactly how the two halves ended up disagreeing without anybody noticing:
 * the tag posts `aqua-explorer:selected`, and the Dev editor was listening for
 * `aqua:portal-block-select`.
 *
 * These tests are the substitute for an import. They read the tag's own source
 * and assert that its message names, its protocol version, the fields it
 * builds and the styles it will accept all match the declarations in
 * `aquaTagBridge.ts`. Change one side and this fails until you change the
 * other.
 *
 * If a test here fails, the fix is to make the two agree — never to relax the
 * assertion.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AQUA_TAG_CAPABILITY_FIELDS,
  AQUA_TAG_CONNECTION_FIELDS,
  AQUA_TAG_COUNT_FIELDS,
  AQUA_TAG_DIAGNOSTICS_FIELDS,
  AQUA_TAG_DIAGNOSTICS_MESSAGE_FIELDS,
  AQUA_TAG_ELEMENT_FIELDS,
  AQUA_TAG_LINKS_MESSAGE_FIELDS,
  AQUA_TAG_MESSAGES,
  AQUA_TAG_PAGE_LINK_FIELDS,
  AQUA_TAG_PERFORMANCE_FIELDS,
  AQUA_TAG_PROTOCOL_VERSION,
  AQUA_TAG_READY_FIELDS,
  AQUA_TAG_SELECTED_FIELDS,
  AQUA_TAG_SIZE_FIELDS,
  AQUA_TAG_STYLE_PROPERTIES,
  AQUA_TAG_THROTTLE_APPLIED_FIELDS,
  AQUA_TAG_THROTTLE_PROFILE_FIELDS,
  acceptAquaTagMessage,
  aquaTagBrowserUrl,
  aquaTagDisable,
  aquaTagEnable,
  aquaTagInspect,
  aquaTagLinks,
  aquaTagOrigin,
  aquaTagPatchMessage,
  aquaTagPing,
  aquaTagReset,
  aquaTagThrottle,
  isAquaTagMessageTrusted,
  parseAquaTagMessage,
  parseAquaTagThrottleProfile,
  type AquaTagElement,
  type AquaTagOutboundMessage,
} from "../src/engines/editor/editing/aquaTagBridge";
import { AQUA_TAG_SOURCE } from "../src/lib/integrations/aquaTagSource";

/** The body of `explorerDescribe`'s returned object literal, straight from the tag. */
function describeBlock(): string {
  const start = AQUA_TAG_SOURCE.indexOf("const explorerDescribe = element =>");
  assert.notEqual(start, -1, "explorerDescribe has been renamed — update this guard, do not delete it");
  const end = AQUA_TAG_SOURCE.indexOf("const explorerReportSelection", start);
  assert.notEqual(end, -1, "explorerReportSelection has been renamed — update this guard");
  const body = AQUA_TAG_SOURCE.slice(start, end);
  const returnAt = body.indexOf("return {");
  assert.notEqual(returnAt, -1, "explorerDescribe no longer returns an object literal");
  return body.slice(returnAt);
}

/** Keys written at the start of a line inside a block, at any nesting depth. */
function objectKeys(block: string): string[] {
  return [...block.matchAll(/^[ \t]*([A-Za-z_$][\w$]*)\s*:/gm)].map(match => match[1]);
}

test("the tag and the bridge name the same messages", () => {
  const inTag = new Set([...AQUA_TAG_SOURCE.matchAll(/"(aqua-explorer:[a-z-]+)"/g)].map(match => match[1]));
  const inBridge = new Set<string>(Object.values(AQUA_TAG_MESSAGES));

  // Both directions on purpose. A name the tag gained and the bridge does not
  // know is the same silent failure as a name that stopped matching — the
  // editor simply never hears it.
  assert.deepEqual(
    [...inTag].sort(),
    [...inBridge].sort(),
    "aquaTagSource.ts and aquaTagBridge.ts disagree about the message names",
  );
});

test("the tag and the bridge agree on the protocol version", () => {
  const declared = AQUA_TAG_SOURCE.match(/explorerProtocolVersion\s*=\s*(\d+)\s*;/);
  assert.ok(declared, "explorerProtocolVersion is no longer a plain number literal in the tag");
  assert.equal(Number(declared[1]), AQUA_TAG_PROTOCOL_VERSION);
});

test("explorerDescribe builds exactly the fields the bridge declares", () => {
  // The tag nests styles inside the element, so a flat read of the block gives
  // the element's own fields followed by the style properties.
  const expected = [...AQUA_TAG_ELEMENT_FIELDS, ...AQUA_TAG_STYLE_PROPERTIES];
  assert.deepEqual(
    objectKeys(describeBlock()).sort(),
    [...expected].sort(),
    "explorerDescribe and AquaTagElement have drifted apart",
  );
});

test("the tag will write back exactly the styles the bridge declares", () => {
  // explorerPatchElement has its own allow-list. If it drifts from the list
  // explorerDescribe reads, the inspector shows a property it cannot change.
  const allowList = AQUA_TAG_SOURCE.match(/const allowed = \[([^\]]+)\];/);
  assert.ok(allowList, "the patch allow-list is no longer a plain array literal in the tag");
  const properties = [...allowList[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual([...properties].sort(), [...AQUA_TAG_STYLE_PROPERTIES].sort());
});

// ── The ENVELOPES ───────────────────────────────────────────────────────────
//
// Everything above pinned the element and the allow-lists, and nothing at all
// read the message envelopes the element travels inside — the `ready` reply,
// the capabilities block, the diagnostics report, or the `selected` wrapper.
// That was a real hole, not a theoretical one: a verifier applied eight
// realistic single-side envelope drifts and 8/8 passed this guard, while every
// one of them made `parseAquaTagMessage` return null. The tag would be
// shouting and the editor hearing nothing — exactly the failure this whole
// module exists to prevent, sneaking back in silently.
//
// The checks below are structural rather than textual: they read the top-level
// keys of each object literal the tag actually builds and compare them, in
// BOTH directions, against the declared field lists. A field the tag GAINS
// fails as loudly as one it loses.

/**
 * The top-level keys of the object literal whose opening brace is at `open`.
 *
 * A real scan rather than a line-anchored regex, because the tag's literals
 * nest (`styles`, `viewport`, `counts`) and contain ternaries. Only positions
 * where a key may legally start — straight after the `{` or after a `,` at
 * depth 1 — count, which is what stops the `undefined` in
 * `text: isImage ? undefined : text.slice(0, 5000)` reading as a key.
 * Shorthand (`propertyId,`) counts too: it is a field the editor must know
 * about just as much as a written-out one.
 */
function literalKeys(source: string, open: number): string[] {
  assert.equal(source[open], "{", "literalKeys was not pointed at an object literal");
  const keys: string[] = [];
  let depth = 0;
  let index = open;
  let quote: string | null = null;
  /** The last non-whitespace character, so a key position can be recognised. */
  let previous = "";
  while (index < source.length) {
    const char = source[index];
    if (quote) {
      if (char === "\\") { index += 2; continue; }
      if (char === quote) quote = null;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") { quote = char; previous = char; index += 1; continue; }
    if (char === "{" || char === "[" || char === "(") { depth += 1; previous = char; index += 1; continue; }
    if (char === "}" || char === "]" || char === ")") {
      depth -= 1;
      if (depth === 0) return keys;
      previous = char;
      index += 1;
      continue;
    }
    if (/\s/.test(char)) { index += 1; continue; }
    if (/[A-Za-z_$]/.test(char)) {
      const name = /^[A-Za-z_$][\w$]*/.exec(source.slice(index))![0];
      const after = source.slice(index + name.length);
      const atKeyPosition = depth === 1 && (previous === "{" || previous === ",");
      if (atKeyPosition && /^\s*[:,}]/.test(after)) keys.push(name);
      index += name.length;
      previous = name[name.length - 1];
      continue;
    }
    previous = char;
    index += 1;
  }
  assert.fail("an object literal in the tag never closed — the guard cannot read it");
}

/** Walk the anchors in order, then read the next object literal's keys. */
function tagLiteralKeys(source: string, anchors: string[]): string[] {
  let at = 0;
  for (const anchor of anchors) {
    const found = source.indexOf(anchor, at);
    assert.notEqual(
      found,
      -1,
      `the tag no longer contains ${JSON.stringify(anchor)} — update this guard, do not delete it`,
    );
    at = found + anchor.length;
  }
  const open = source.indexOf("{", at);
  assert.notEqual(open, -1, `no object literal follows ${JSON.stringify(anchors[anchors.length - 1])}`);
  return literalKeys(source, open);
}

/**
 * Every literal the tag posts, against every field list the bridge declares.
 *
 * Takes the source as an argument rather than reading the module constant, so
 * the guard can be turned on a MUTATED in-memory copy and proved to notice —
 * see the mutation test at the end of this file. A guard nobody has tried to
 * fool is only a guess that it works.
 */
function assertEnvelopesMatch(source: string): void {
  const pairs: Array<{ what: string; anchors: string[]; declared: readonly string[] }> = [
    // tag → editor: the answer to a ping. Its `requestId` is what the editor
    // matches against its own, so a drift here is a handshake that never lands.
    {
      what: "the ready reply",
      anchors: ['"aqua-explorer:ping" && typeof message.requestId === "string"', "respondToExplorer(event,"],
      declared: AQUA_TAG_READY_FIELDS,
    },
    { what: "explorerCapabilities", anchors: ["const explorerCapabilities"], declared: AQUA_TAG_CAPABILITY_FIELDS },
    {
      what: "the diagnostics reply",
      anchors: ['"aqua-explorer:inspect" && typeof message.requestId === "string"', "respondToExplorer(event,"],
      declared: AQUA_TAG_DIAGNOSTICS_MESSAGE_FIELDS,
    },
    { what: "explorerDiagnostics", anchors: ["const explorerDiagnostics"], declared: AQUA_TAG_DIAGNOSTICS_FIELDS },
    { what: "the diagnostics viewport", anchors: ["const explorerDiagnostics", "viewport:"], declared: AQUA_TAG_SIZE_FIELDS },
    { what: "the diagnostics document size", anchors: ["const explorerDiagnostics", "document:"], declared: AQUA_TAG_SIZE_FIELDS },
    { what: "the diagnostics counts", anchors: ["const explorerDiagnostics", "counts:"], declared: AQUA_TAG_COUNT_FIELDS },
    { what: "explorerPerformance", anchors: ["const explorerPerformance", "return"], declared: AQUA_TAG_PERFORMANCE_FIELDS },
    {
      what: "explorerConnection",
      // Stepped past the early `return undefined` on purpose — the literal is
      // the SECOND return in that function.
      anchors: ["const explorerConnection", "if (!connection) return undefined;", "return"],
      declared: AQUA_TAG_CONNECTION_FIELDS,
    },
    // tag → editor: the navigator's link list, and one link inside it. Added
    // with the navigator (dev-editor-finish phase 8) — the tag had always
    // COUNTED document.links and never said which they were.
    {
      what: "the links reply",
      anchors: ['"aqua-explorer:links" && typeof message.requestId === "string"', "respondToExplorer(event,"],
      declared: AQUA_TAG_LINKS_MESSAGE_FIELDS,
    },
    { what: "one page link", anchors: ["const explorerPageLinks", "found.push("], declared: AQUA_TAG_PAGE_LINK_FIELDS },
    // tag → editor: the selection itself, and the element inside it.
    { what: "the selected envelope", anchors: ["const explorerReportSelection"], declared: AQUA_TAG_SELECTED_FIELDS },
    { what: "explorerDescribe", anchors: ["const explorerDescribe", "return"], declared: AQUA_TAG_ELEMENT_FIELDS },
    { what: "the element's styles", anchors: ["const explorerDescribe", "styles:"], declared: AQUA_TAG_STYLE_PROPERTIES },
    // tag → editor: the throttle acknowledgement, and the profile inside it.
    // The reply posts `throttleProfile`, and that variable only ever holds
    // what `throttleNormalize`'s literal built — so pinning the reply envelope
    // here and the normalize literal below covers the whole payload.
    {
      what: "the throttle-applied reply",
      anchors: ['"aqua-explorer:throttle"', "respondToExplorer(event,"],
      declared: AQUA_TAG_THROTTLE_APPLIED_FIELDS,
    },
    {
      what: "the normalized throttle profile",
      // Stepped past the guard clauses on purpose — the literal is the return
      // AFTER the all-zeroes early exit.
      anchors: ["const throttleNormalize", "if (!latencyMs && !downKbps && !offline) return null;", "return"],
      declared: AQUA_TAG_THROTTLE_PROFILE_FIELDS,
    },
  ];

  for (const { what, anchors, declared } of pairs) {
    assert.deepEqual(
      tagLiteralKeys(source, anchors).sort(),
      [...declared].sort(),
      `${what} and aquaTagBridge.ts have drifted apart — make the two agree, never relax this`,
    );
  }
}

test("every envelope the tag posts matches the shape the bridge declares", () => {
  assertEnvelopesMatch(AQUA_TAG_SOURCE);
});

/**
 * One realistic way the tag's half could move on its own.
 *
 * Each is a SINGLE-SIDE change: the tag source alone, exactly as it would look
 * if somebody tidied a name or added a field there and never touched
 * `aquaTagBridge.ts`. Both directions are represented — fields renamed, fields
 * dropped, fields gained.
 */
interface EnvelopeDrift {
  name: string;
  find: string;
  replace: string;
  /** What it would break in the editor, so the failure has a consequence. */
  breaks: string;
}

const DRIFTS: EnvelopeDrift[] = [
  {
    name: "ready renames requestId",
    find: "        requestId: message.requestId,\n        propertyId,",
    replace: "        replyTo: message.requestId,\n        propertyId,",
    breaks: "the handshake never completes — the editor waits, then says no tag is installed",
  },
  {
    name: "ready drops propertyId",
    find: "        propertyId,\n        path: location.pathname,",
    replace: "        path: location.pathname,",
    breaks: "parseAquaTagMessage rejects the ready reply outright",
  },
  {
    name: "ready gains a frame id",
    find: "        capabilities: explorerCapabilities(),",
    replace: "        frameId: explorerElementSequence,\n        capabilities: explorerCapabilities(),",
    breaks: "a field crosses the origin boundary that nothing on this side validates",
  },
  {
    name: "capabilities renames editableElements",
    find: "    networkThrottle: true,\n    editableElements: editableElements(),",
    replace: "    networkThrottle: true,\n    elementCount: editableElements(),",
    breaks: "the ready reply is rejected, so a perfectly tagged page reads as untagged",
  },
  {
    name: "capabilities renames networkThrottle",
    find: "    visualEditing: true,\n    networkThrottle: true,",
    replace: "    visualEditing: true,\n    throttling: true,",
    breaks: "the wifi control reads every page as an old cached tag and never trusts the wrap",
  },
  {
    name: "capabilities gains a count",
    find: "    inspect: true,\n    visualEditing: true,",
    replace: "    inspect: true,\n    visualEditing: true,\n    forms: document.forms.length,",
    breaks: "the editor silently ignores something the tag now offers",
  },
  {
    name: "diagnostics envelope renames its payload",
    find: "        diagnostics: explorerDiagnostics(),",
    replace: "        report: explorerDiagnostics(),",
    breaks: "every inspect answer is dropped as malformed",
  },
  {
    name: "diagnostics renames recentErrors",
    find: "    recentErrors: explorerErrors.slice(-8),",
    replace: "    errors: explorerErrors.slice(-8),",
    breaks: "parseDiagnostics returns null, so the inspector shows nothing at all",
  },
  {
    name: "counts renames resources",
    find: '      resources: performance.getEntriesByType("resource").length,',
    replace: '      assets: performance.getEntriesByType("resource").length,',
    breaks: "parseCounts returns null and the whole diagnostics message is discarded",
  },
  {
    name: "counts gains a script count",
    find: "      links: document.links.length,",
    replace: "      links: document.links.length,\n      scripts: document.scripts.length,",
    breaks: "a new count the editor will never surface",
  },
  {
    name: "selected renames the element it carries",
    find: "    element: explorerSelected ? explorerDescribe(explorerSelected) : null,",
    replace: "    selection: explorerSelected ? explorerDescribe(explorerSelected) : null,",
    breaks: "THE bug — a click resolves on the page and the editor hears nothing",
  },
  {
    name: "selected gains a path",
    find: '    type: "aqua-explorer:selected",',
    replace: '    type: "aqua-explorer:selected",\n    path: location.pathname,',
    breaks: "an unvalidated field rides in beside the operator's selection",
  },
  // ── The navigator's link list (phase 8). Both directions, same as the rest.
  {
    name: "the links reply renames requestId",
    find: "        requestId: message.requestId,\n        links: explorerPageLinks(),",
    replace: "        replyTo: message.requestId,\n        links: explorerPageLinks(),",
    breaks: "the navigator's request is never answered — the list sits on 'reading the page' forever",
  },
  {
    name: "the links reply drops the links",
    find: "        links: explorerPageLinks(),\n",
    replace: "",
    breaks: "the reply arrives with nothing in it and parseAquaTagMessage rejects it outright",
  },
  {
    name: "the links reply gains a path",
    find: '        type: "aqua-explorer:links-found",',
    replace: '        type: "aqua-explorer:links-found",\n        path: location.pathname,',
    breaks: "an unvalidated field rides in beside the page's links",
  },
  {
    name: "a page link renames href",
    find: "        href: href,\n        label: explorerLinkLabel(anchor),",
    replace: "        url: href,\n        label: explorerLinkLabel(anchor),",
    breaks: "every link is rejected, so a tagged page reads as linking nowhere",
  },
  {
    name: "a page link gains the anchor's target",
    find: "        label: explorerLinkLabel(anchor),",
    replace: "        label: explorerLinkLabel(anchor),\n        target: anchor.target,",
    breaks: "a field the editor neither validates nor renders crosses the origin boundary",
  },
  {
    name: "performance renames loadMs",
    find: "      loadMs: navigation && navigation.loadEventEnd",
    replace: "      loadTimeMs: navigation && navigation.loadEventEnd",
    breaks: "the load time reads as absent forever",
  },
  {
    name: "connection renames downlinkMbps",
    find: "      downlinkMbps: connection.downlink,",
    replace: "      downlink: connection.downlink,",
    breaks: "the connection block quietly loses its speed",
  },
  {
    name: "the viewport measurement is shortened",
    find: "    viewport: { width: window.innerWidth, height: window.innerHeight },",
    replace: "    viewport: { w: window.innerWidth, height: window.innerHeight },",
    breaks: "parseSize returns null, taking the entire diagnostics message with it",
  },
  {
    name: "the element drops alt",
    find: '      alt: isImage ? element.alt || "" : undefined,\n',
    replace: "",
    breaks: "an image selection arrives with no alt text to edit",
  },
  {
    name: "the element's styles gain line height",
    find: "        textAlign: styles.textAlign,",
    replace: "        textAlign: styles.textAlign,\n        lineHeight: styles.lineHeight,",
    breaks: "read-back offers a property the patch allow-list will never write",
  },
  {
    name: "throttle-applied renames its profile",
    find: "        profile: throttleProfile,",
    replace: "        applied: throttleProfile,",
    breaks: "the ack is dropped as malformed — the wifi icon never turns amber, and never turns back",
  },
  {
    name: "throttle-applied gains a path",
    find: '        type: "aqua-explorer:throttle-applied",',
    replace: '        type: "aqua-explorer:throttle-applied",\n        path: location.pathname,',
    breaks: "an unvalidated field rides in beside the throttle acknowledgement",
  },
  {
    name: "the throttle profile drops offline",
    find: "      latencyMs,\n      downKbps,\n      offline,",
    replace: "      latencyMs,\n      downKbps,",
    breaks: "parseAquaTagThrottleProfile returns null, so an Offline ack reads as no ack at all",
  },
  {
    name: "the throttle profile renames downKbps",
    find: "      downKbps,\n      offline,",
    replace: "      downKilobitsPerSecond: downKbps,\n      offline,",
    breaks: "every paced ack is rejected and the UI can never say what speed is in force",
  },
  {
    name: "the throttle profile gains an upload speed",
    find: "      latencyMs,\n      downKbps,",
    replace: "      latencyMs,\n      upKbps: 0,\n      downKbps,",
    breaks: "a field crosses the boundary that the editor neither validates nor renders",
  },
];

test("the envelope guard actually bites — every single-side drift is detected", () => {
  const detected: string[] = [];
  for (const drift of DRIFTS) {
    // A mutation that matched twice would not be single-side, and one that
    // matched nothing would be a test proving nothing.
    assert.equal(
      AQUA_TAG_SOURCE.split(drift.find).length - 1,
      1,
      `"${drift.name}" does not describe exactly one place in the tag`,
    );
    // An in-memory copy. `aquaTagSource.ts` itself is never touched.
    const mutated = AQUA_TAG_SOURCE.replace(drift.find, drift.replace);
    assert.notEqual(mutated, AQUA_TAG_SOURCE, `"${drift.name}" changed nothing`);
    assert.throws(
      () => assertEnvelopesMatch(mutated),
      `the guard did NOT notice "${drift.name}" — in the editor this would be: ${drift.breaks}`,
    );
    detected.push(drift.name);
  }
  assert.equal(detected.length, DRIFTS.length, "not every drift was exercised");
});

test("the tag gates every inbound message on the version the builders set", () => {
  // This is why the outbound builders exist: without a matching version the
  // tag returns early and the editor waits for a reply that never comes.
  assert.match(
    AQUA_TAG_SOURCE,
    /message\.version !== explorerProtocolVersion/,
    "the tag no longer gates on version — the builders' guarantee is now unenforced",
  );
  assert.match(AQUA_TAG_SOURCE, /"aqua-explorer:ping" && typeof message\.requestId === "string"/);
  assert.match(AQUA_TAG_SOURCE, /"aqua-explorer:inspect" && typeof message\.requestId === "string"/);
  assert.match(AQUA_TAG_SOURCE, /"aqua-explorer:links" && typeof message\.requestId === "string"/);
  assert.match(AQUA_TAG_SOURCE, /"aqua-explorer:patch" && typeof message\.elementId === "string"/);
  // The throttle arm sits behind the same version gate as its siblings, and
  // its payload goes through the normalizer, never straight into the wrap.
  assert.match(AQUA_TAG_SOURCE, /message\.type === "aqua-explorer:throttle"\) \{/);
  assert.match(AQUA_TAG_SOURCE, /throttleApply\(throttleNormalize\(message\.profile\)\)/);

  const built: AquaTagOutboundMessage[] = [
    aquaTagPing("request-1"),
    aquaTagInspect("request-2"),
    aquaTagLinks("request-3"),
    aquaTagEnable(),
    aquaTagDisable(),
    aquaTagPatchMessage("aqua-element-1", { text: "Hello" }),
    aquaTagReset(),
    aquaTagThrottle({ latencyMs: 2000, downKbps: 400, offline: false }),
    aquaTagThrottle(null),
  ];
  for (const message of built) {
    assert.equal(message.version, AQUA_TAG_PROTOCOL_VERSION, `${message.type} was built without a version`);
    assert.ok(Object.values(AQUA_TAG_MESSAGES).includes(message.type), `${message.type} is not a protocol message`);
  }
  assert.deepEqual(aquaTagPing("request-1"), {
    type: "aqua-explorer:ping",
    version: 1,
    requestId: "request-1",
  });
  assert.deepEqual(aquaTagPatchMessage("aqua-element-1", { styles: { color: "red" } }), {
    type: "aqua-explorer:patch",
    version: 1,
    elementId: "aqua-element-1",
    patch: { styles: { color: "red" } },
  });
  assert.deepEqual(aquaTagThrottle({ latencyMs: 560, downKbps: 1500, offline: false }), {
    type: "aqua-explorer:throttle",
    version: 1,
    profile: { latencyMs: 560, downKbps: 1500, offline: false },
  });
  // Clearing is a message, not a missing message.
  assert.deepEqual(aquaTagThrottle(null), { type: "aqua-explorer:throttle", version: 1, profile: null });
});

test("the parser accepts the throttle acknowledgement and keeps it honest", () => {
  const applied = parseAquaTagMessage({
    type: AQUA_TAG_MESSAGES.throttleApplied,
    version: AQUA_TAG_PROTOCOL_VERSION,
    profile: { latencyMs: 2000, downKbps: 400, offline: false },
  });
  assert.equal(applied?.type, AQUA_TAG_MESSAGES.throttleApplied);
  assert.deepEqual(
    applied?.type === AQUA_TAG_MESSAGES.throttleApplied ? applied.profile : null,
    { latencyMs: 2000, downKbps: 400, offline: false },
  );

  // "Back to normal" is an event the UI renders, not an absence.
  const cleared = parseAquaTagMessage({
    type: AQUA_TAG_MESSAGES.throttleApplied,
    version: AQUA_TAG_PROTOCOL_VERSION,
    profile: null,
  });
  assert.equal(cleared?.type === AQUA_TAG_MESSAGES.throttleApplied ? cleared.profile : undefined, null);

  // Extra fields the sending page attached never travel into editor state.
  const trimmed = parseAquaTagMessage({
    type: AQUA_TAG_MESSAGES.throttleApplied,
    version: AQUA_TAG_PROTOCOL_VERSION,
    profile: { latencyMs: 100, downKbps: 0, offline: false, onclick: "steal()" },
  });
  const profile = trimmed?.type === AQUA_TAG_MESSAGES.throttleApplied ? trimmed.profile : null;
  assert.ok(profile);
  assert.deepEqual(Object.keys(profile).sort(), [...AQUA_TAG_THROTTLE_PROFILE_FIELDS].sort());

  // Malformed profiles are rejected outright, never coerced into a throttle.
  const rejectedProfiles: unknown[] = [
    { latencyMs: -1, downKbps: 0, offline: false },
    { latencyMs: "2000", downKbps: 400, offline: false },
    { latencyMs: 0, downKbps: Number.NaN, offline: false },
    { latencyMs: 0, downKbps: Number.POSITIVE_INFINITY, offline: false },
    { latencyMs: 0, downKbps: 0 },
    { latencyMs: 0, downKbps: 0, offline: "yes" },
    "slow-3g",
    42,
  ];
  for (const bad of rejectedProfiles) {
    assert.equal(
      parseAquaTagMessage({ type: AQUA_TAG_MESSAGES.throttleApplied, version: AQUA_TAG_PROTOCOL_VERSION, profile: bad }),
      null,
      `the parser accepted a throttle profile of ${JSON.stringify(bad)}`,
    );
    assert.equal(parseAquaTagThrottleProfile(bad), null, `parseAquaTagThrottleProfile accepted ${JSON.stringify(bad)}`);
  }

  // No version and wrong version are the same silence as every other message.
  assert.equal(parseAquaTagMessage({ type: AQUA_TAG_MESSAGES.throttleApplied, profile: null }), null);
  assert.equal(parseAquaTagMessage({ type: AQUA_TAG_MESSAGES.throttleApplied, version: 2, profile: null }), null);
  // The outbound builder must never be parseable as an inbound ack.
  assert.equal(parseAquaTagMessage(aquaTagThrottle({ latencyMs: 1, downKbps: 1, offline: false })), null);
});

test("the parser accepts the navigator's link list and keeps it honest", () => {
  const answered = parseAquaTagMessage({
    type: AQUA_TAG_MESSAGES.linksFound,
    version: AQUA_TAG_PROTOCOL_VERSION,
    requestId: "links-1",
    links: [
      { href: "https://beast-marks.vercel.app/", label: "Home" },
      { href: "https://beast-marks.vercel.app/pricing", label: "" },
    ],
  });
  assert.equal(answered?.type, AQUA_TAG_MESSAGES.linksFound);
  const links = answered?.type === AQUA_TAG_MESSAGES.linksFound ? answered.links : [];
  assert.equal(links.length, 2);
  // An empty label is a real link with no words in it (an icon), not a broken one.
  assert.equal(links[1].label, "");
  // Rebuilt key by key: nothing the sending page attached travels on.
  const smuggled = parseAquaTagMessage({
    type: AQUA_TAG_MESSAGES.linksFound,
    version: AQUA_TAG_PROTOCOL_VERSION,
    requestId: "links-2",
    links: [{ href: "https://example.test/a", label: "A", onclick: "steal()" }],
  });
  const one = smuggled?.type === AQUA_TAG_MESSAGES.linksFound ? smuggled.links[0] : null;
  assert.ok(one);
  assert.deepEqual(Object.keys(one).sort(), [...AQUA_TAG_PAGE_LINK_FIELDS].sort());

  // "This page links nowhere" is an ANSWER the navigator renders, not silence.
  const none = parseAquaTagMessage({
    type: AQUA_TAG_MESSAGES.linksFound,
    version: AQUA_TAG_PROTOCOL_VERSION,
    requestId: "links-3",
    links: [],
  });
  assert.deepEqual(none?.type === AQUA_TAG_MESSAGES.linksFound ? none.links : null, []);

  // Malformed lists are rejected outright — a half-read list is worse than none.
  const rejected: unknown[] = [
    { requestId: "x", links: "https://example.test/a" },
    { requestId: "x", links: [{ href: "https://example.test/a" }] },
    { requestId: "x", links: [{ href: "", label: "A" }] },
    { requestId: "x", links: [{ href: "https://example.test/a", label: 7 }] },
    { requestId: "x", links: ["https://example.test/a"] },
    { requestId: "", links: [] },
    { links: [] },
  ];
  for (const bad of rejected) {
    assert.equal(
      parseAquaTagMessage({ type: AQUA_TAG_MESSAGES.linksFound, version: AQUA_TAG_PROTOCOL_VERSION, ...(bad as object) }),
      null,
      `the parser accepted a link list of ${JSON.stringify(bad)}`,
    );
  }

  // Wrong version is the same silence as every other message, and the outbound
  // request must never be parseable as an inbound answer.
  assert.equal(parseAquaTagMessage({ type: AQUA_TAG_MESSAGES.linksFound, version: 2, requestId: "x", links: [] }), null);
  assert.equal(parseAquaTagMessage(aquaTagLinks("links-4")), null);
});

test("the tag only ever reports SAME-ORIGIN links, capped and deduplicated", () => {
  // Structural, because the tag is a string of browser JS with no module
  // system to import and test. The editor trusts exactly one origin, so a
  // navigator row pointing at another domain would land the operator on a page
  // the editor then refuses to speak to — the rule belongs in the tag, before
  // the message is sent, not in a filter afterwards.
  const start = AQUA_TAG_SOURCE.indexOf("const explorerPageLinks");
  assert.notEqual(start, -1, "explorerPageLinks has been renamed — update this guard, do not delete it");
  const body = AQUA_TAG_SOURCE.slice(start, AQUA_TAG_SOURCE.indexOf("\n  const ", start + 10));
  assert.match(body, /url\.origin !== location\.origin/, "the same-origin rule is gone from the tag");
  assert.match(body, /url\.protocol !== "http:" && url\.protocol !== "https:"/);
  // Hash and query dropped: origin + pathname, never url.href.
  assert.match(body, /href = url\.origin \+ url\.pathname;/);
  assert.equal(/href = url\.href/.test(body), false, "a hash or query would make one page look like eight");
  assert.match(body, /found\.length >= 60/, "the cap is what stops a thousand-row index flooding a postMessage");
  assert.match(body, /if \(seen\[href\]\) continue;/, "the same destination twice is one row, not two");
});

test("a cached pre-throttle tag still completes the handshake", () => {
  // The tag is served with stale-while-revalidate, so a page can run a build
  // from before the wifi control existed. Its ready reply has no
  // `networkThrottle` — that must read as "can't throttle", never as
  // "malformed", or the whole handshake dies for a capability nobody used.
  const ready = parseAquaTagMessage({
    type: AQUA_TAG_MESSAGES.ready,
    version: AQUA_TAG_PROTOCOL_VERSION,
    requestId: "request-1",
    propertyId: "site-1",
    path: "/",
    title: "Example",
    capabilities: { inspect: true, visualEditing: true, editableElements: 3 },
  });
  assert.equal(ready?.type, AQUA_TAG_MESSAGES.ready);
  assert.equal(ready?.type === AQUA_TAG_MESSAGES.ready ? ready.capabilities.networkThrottle : null, false);

  const current = parseAquaTagMessage({
    type: AQUA_TAG_MESSAGES.ready,
    version: AQUA_TAG_PROTOCOL_VERSION,
    requestId: "request-1",
    propertyId: "site-1",
    path: "/",
    title: "Example",
    capabilities: { inspect: true, visualEditing: true, networkThrottle: true, editableElements: 3 },
  });
  assert.equal(current?.type === AQUA_TAG_MESSAGES.ready ? current.capabilities.networkThrottle : null, true);
});

/** A selection shaped exactly as the tag builds one for a text element. */
function textSelection(overrides: Partial<AquaTagElement> = {}) {
  return {
    type: AQUA_TAG_MESSAGES.selected,
    version: AQUA_TAG_PROTOCOL_VERSION,
    element: {
      id: "aqua-element-1",
      tagName: "h1",
      kind: "text",
      label: "Welcome",
      text: "Welcome",
      styles: {
        color: "rgb(0, 0, 0)",
        backgroundColor: "rgba(0, 0, 0, 0)",
        fontSize: "48px",
        fontWeight: "700",
        textAlign: "start",
      },
      ...overrides,
    },
  };
}

test("the parser accepts the three messages the tag sends", () => {
  const selected = parseAquaTagMessage(textSelection());
  assert.equal(selected?.type, AQUA_TAG_MESSAGES.selected);
  assert.equal(selected?.type === AQUA_TAG_MESSAGES.selected ? selected.element?.label : null, "Welcome");

  // An image carries src/alt and no text — the tag sends undefined for the
  // branch that does not apply, and structured cloning drops the key entirely.
  const image = parseAquaTagMessage({
    type: AQUA_TAG_MESSAGES.selected,
    version: AQUA_TAG_PROTOCOL_VERSION,
    element: {
      id: "aqua-element-2",
      tagName: "img",
      kind: "image",
      label: "Hero",
      src: "https://example.com/hero.png",
      alt: "Hero",
      styles: {
        color: "rgb(0, 0, 0)",
        backgroundColor: "rgba(0, 0, 0, 0)",
        fontSize: "16px",
        fontWeight: "400",
        textAlign: "start",
      },
    },
  });
  assert.equal(image?.type, AQUA_TAG_MESSAGES.selected);
  assert.equal(image?.type === AQUA_TAG_MESSAGES.selected ? image.element?.src : null, "https://example.com/hero.png");
  assert.equal(image?.type === AQUA_TAG_MESSAGES.selected ? "text" in (image.element ?? {}) : true, false);

  // A cleared selection is an event, not an absence: the editor must be able
  // to tell "nothing is selected now" from "no message arrived".
  const cleared = parseAquaTagMessage({
    type: AQUA_TAG_MESSAGES.selected,
    version: AQUA_TAG_PROTOCOL_VERSION,
    element: null,
  });
  assert.equal(cleared?.type === AQUA_TAG_MESSAGES.selected ? cleared.element : undefined, null);

  const ready = parseAquaTagMessage({
    type: AQUA_TAG_MESSAGES.ready,
    version: AQUA_TAG_PROTOCOL_VERSION,
    requestId: "request-1",
    propertyId: "site-1",
    path: "/",
    title: "Example",
    capabilities: { inspect: true, visualEditing: true, editableElements: 3 },
  });
  assert.equal(ready?.type, AQUA_TAG_MESSAGES.ready);
  assert.equal(ready?.type === AQUA_TAG_MESSAGES.ready ? ready.capabilities.editableElements : null, 3);

  const diagnostics = parseAquaTagMessage({
    type: AQUA_TAG_MESSAGES.diagnostics,
    version: AQUA_TAG_PROTOCOL_VERSION,
    requestId: "request-2",
    diagnostics: {
      path: "/contact",
      title: "Contact",
      readyState: "complete",
      viewport: { width: 1280, height: 800 },
      document: { width: 1280, height: 2400 },
      counts: { editableElements: 12, forms: 1, images: 4, links: 8, resources: 20 },
      performance: { loadMs: 420 },
      recentErrors: ["Something went wrong"],
    },
  });
  assert.equal(diagnostics?.type, AQUA_TAG_MESSAGES.diagnostics);
  assert.equal(
    diagnostics?.type === AQUA_TAG_MESSAGES.diagnostics ? diagnostics.diagnostics.performance.loadMs : null,
    420,
  );
});

test("the parser rejects anything that is not a well-formed protocol message", () => {
  // This data crossed an origin boundary. Every one of these would be a cast
  // away from becoming the operator's "selection".
  const rejected: unknown[] = [
    null,
    undefined,
    "aqua-explorer:selected",
    42,
    {},
    { type: AQUA_TAG_MESSAGES.selected },
    { type: "aqua:portal-block-select", blockId: "block-1" },
    { type: AQUA_TAG_MESSAGES.selected, version: 2, element: null },
    { type: AQUA_TAG_MESSAGES.selected, version: "1", element: null },
    { type: AQUA_TAG_MESSAGES.selected, version: AQUA_TAG_PROTOCOL_VERSION },
    { type: AQUA_TAG_MESSAGES.selected, version: AQUA_TAG_PROTOCOL_VERSION, element: "h1" },
    textSelection({ id: "" }),
    textSelection({ id: 7 as unknown as string }),
    textSelection({ kind: "video" as unknown as "text" }),
    textSelection({ label: null as unknown as string }),
    textSelection({ text: { toString: () => "gotcha" } as unknown as string }),
    textSelection({ styles: undefined as unknown as AquaTagElement["styles"] }),
    textSelection({ styles: { color: "red" } as unknown as AquaTagElement["styles"] }),
    { type: AQUA_TAG_MESSAGES.ready, version: AQUA_TAG_PROTOCOL_VERSION, requestId: "r", capabilities: { inspect: true } },
    { type: AQUA_TAG_MESSAGES.ready, version: AQUA_TAG_PROTOCOL_VERSION, requestId: "", propertyId: "p", path: "/", title: "T", capabilities: { inspect: true, visualEditing: true, editableElements: 1 } },
    { type: AQUA_TAG_MESSAGES.diagnostics, version: AQUA_TAG_PROTOCOL_VERSION, requestId: "r", diagnostics: {} },
    // Outbound messages must never be parsed as though the tag sent them.
    aquaTagPing("request-1"),
    aquaTagEnable(),
  ];
  for (const value of rejected) {
    assert.equal(parseAquaTagMessage(value), null, `parser accepted ${JSON.stringify(value) ?? String(value)}`);
  }
});

test("the parser keeps only declared fields", () => {
  // A spread would carry a hostile page's extra properties into editor state
  // and onward to the assistant.
  const parsed = parseAquaTagMessage({
    ...textSelection(),
    element: { ...textSelection().element, onclick: "steal()", __proto__polluted: true },
  });
  assert.equal(parsed?.type, AQUA_TAG_MESSAGES.selected);
  const element = parsed?.type === AQUA_TAG_MESSAGES.selected ? parsed.element : null;
  assert.ok(element);
  assert.deepEqual(Object.keys(element).sort(), ["id", "kind", "label", "styles", "tagName", "text"]);
  assert.deepEqual(Object.keys(element.styles).sort(), [...AQUA_TAG_STYLE_PROPERTIES].sort());
});

test("aquaTagOrigin returns one exact origin, or nothing", () => {
  assert.equal(aquaTagOrigin("https://example.com/path?preview=true"), "https://example.com");
  assert.equal(aquaTagOrigin("http://localhost:3035/"), "http://localhost:3035");
  assert.equal(aquaTagOrigin("https://example.com:8443/a/b"), "https://example.com:8443");

  // A relative preview path is same-origin with the editor, and only a base
  // can say which origin that is.
  assert.equal(aquaTagOrigin("/preview/site-1", "https://portal.aquacrm.co.uk/dev"), "https://portal.aquacrm.co.uk");
  assert.equal(aquaTagOrigin("/preview/site-1"), null);

  // Nothing here has an origin the editor could compare against, so nothing
  // here may produce one.
  for (const value of [
    "",
    "   ",
    "not-a-url",
    "about:blank",
    "javascript:alert(1)",
    "data:text/html,<h1>hi</h1>",
    "blob:https://example.com/1234",
    "file:///Users/ed/site/index.html",
    null,
    undefined,
  ]) {
    assert.equal(aquaTagOrigin(value as string | null | undefined), null, `aquaTagOrigin produced an origin for ${String(value)}`);
  }

  // Never the wildcard, whatever it is handed.
  assert.notEqual(aquaTagOrigin("*"), "*");
  assert.equal(aquaTagOrigin("*"), null);
});

test("the browser points at the page the tag ANSWERS on, not the one that was typed", () => {
  // The bug, exactly as reproduced. `edsgame.com` redirects to `www.edsgame.com`;
  // MAP followed that and recorded it, and the setup card said so out loud —
  // while the editor still derived its one trusted origin from the typed
  // address and therefore rejected every message its own tag sent.
  const redirecting = {
    siteUrl: "https://edsgame.com/",
    map: { tag: { finalUrl: "https://www.edsgame.com/" } },
  };
  assert.equal(aquaTagBrowserUrl(redirecting), "https://www.edsgame.com/");
  assert.equal(aquaTagOrigin(aquaTagBrowserUrl(redirecting)), "https://www.edsgame.com");
  // The old seeding, kept here as the thing that must never come back.
  assert.notEqual(aquaTagOrigin(redirecting.siteUrl), aquaTagOrigin(redirecting.map.tag.finalUrl));

  // Never mapped, mapped-but-unreachable, or mapped to the same address: the
  // typed address is all there is, and it is still used.
  assert.equal(aquaTagBrowserUrl({ siteUrl: "https://oceanboulevard.co.uk/" }), "https://oceanboulevard.co.uk/");
  assert.equal(aquaTagBrowserUrl({ siteUrl: "https://a.test/", map: { tag: {} } }), "https://a.test/");
  assert.equal(aquaTagBrowserUrl({ siteUrl: "https://a.test/", map: { tag: null } }), "https://a.test/");
  assert.equal(aquaTagBrowserUrl({ siteUrl: "https://a.test/", map: null }), "https://a.test/");
  assert.equal(aquaTagBrowserUrl({}), "");
  assert.equal(aquaTagBrowserUrl(null), "");
  assert.equal(aquaTagBrowserUrl(undefined), "");

  // A recorded `finalUrl` that could not produce a trusted origin is not
  // preferred — the box falls back rather than being blanked or, worse, being
  // pointed somewhere with no origin at all.
  for (const finalUrl of ["", "   ", "not-a-url", "about:blank", "file:///tmp/x.html", "javascript:alert(1)"]) {
    assert.equal(
      aquaTagBrowserUrl({ siteUrl: "https://a.test/", map: { tag: { finalUrl } } }),
      "https://a.test/",
      `a finalUrl of ${JSON.stringify(finalUrl)} must not be preferred`,
    );
  }
});

test("using the mapped URL did NOT widen the origin policy", () => {
  // The temptation when fixing the redirect bug is to accept both the apex and
  // the www host, or to match on suffix. That trades one wrong-origin bug for a
  // class of trust bugs, so it is pinned shut here: whichever ONE origin is
  // derived, the other host is still a stranger.
  const frameWindow = { name: "preview-frame" };
  const mapped = aquaTagBrowserUrl({
    siteUrl: "https://edsgame.com/",
    map: { tag: { finalUrl: "https://www.edsgame.com/" } },
  });
  const policy = { allowedOrigin: aquaTagOrigin(mapped), frameWindow };
  const data = textSelection();

  assert.equal(isAquaTagMessageTrusted({ origin: "https://www.edsgame.com", source: frameWindow, data }, policy), true);
  for (const origin of [
    "https://edsgame.com",
    "https://www.edsgame.com.attacker.net",
    "https://evil.www.edsgame.com",
    "http://www.edsgame.com",
  ]) {
    assert.equal(
      isAquaTagMessageTrusted({ origin, source: frameWindow, data }, policy),
      false,
      `${origin} must not be trusted just because www.edsgame.com is`,
    );
  }

  // …and the same the other way round: an apex-hosted tag does not make the
  // www host trusted either.
  const apex = { allowedOrigin: aquaTagOrigin(aquaTagBrowserUrl({ siteUrl: "https://edsgame.com/" })), frameWindow };
  assert.equal(isAquaTagMessageTrusted({ origin: "https://edsgame.com", source: frameWindow, data }, apex), true);
  assert.equal(isAquaTagMessageTrusted({ origin: "https://www.edsgame.com", source: frameWindow, data }, apex), false);
});

test("only the project's own tagged origin and frame are trusted", () => {
  const frameWindow = { name: "preview-frame" };
  const other = { name: "some-other-frame" };
  const allowedOrigin = aquaTagOrigin("https://client-site.com/about");
  assert.equal(allowedOrigin, "https://client-site.com");
  const policy = { allowedOrigin, frameWindow };
  const data = textSelection();

  // The whole point: an EXTERNAL tagged site is trusted when it is the site
  // the editor pointed the preview at. This is what the old
  // `event.origin !== window.location.origin` rule wrongly refused.
  assert.equal(isAquaTagMessageTrusted({ origin: "https://client-site.com", source: frameWindow, data }, policy), true);

  const untrusted: { origin: string; source: unknown }[] = [
    // Right frame, wrong origin — including the lookalikes a sloppy
    // startsWith/endsWith/includes comparison would wave through.
    { origin: "https://attacker.com", source: frameWindow },
    { origin: "https://client-site.com.attacker.net", source: frameWindow },
    { origin: "https://evil.client-site.com", source: frameWindow },
    { origin: "http://client-site.com", source: frameWindow },
    { origin: "https://client-site.com:8443", source: frameWindow },
    { origin: "https://client-site.com/", source: frameWindow },
    { origin: "null", source: frameWindow },
    { origin: "*", source: frameWindow },
    { origin: "", source: frameWindow },
    // Right origin, wrong frame — a nested ad or widget iframe on the client's
    // own site shares the origin but is not the preview.
    { origin: "https://client-site.com", source: other },
    { origin: "https://client-site.com", source: null },
    { origin: "https://client-site.com", source: undefined },
  ];
  for (const event of untrusted) {
    assert.equal(isAquaTagMessageTrusted({ ...event, data }, policy), false, `trusted a message from ${event.origin}`);
  }

  // No allowed origin, or no mounted frame, means trust nothing at all.
  assert.equal(isAquaTagMessageTrusted({ origin: "https://client-site.com", source: frameWindow, data }, { allowedOrigin: null, frameWindow }), false);
  assert.equal(isAquaTagMessageTrusted({ origin: "https://client-site.com", source: frameWindow, data }, { allowedOrigin: "https://client-site.com", frameWindow: null }), false);
  // A hand-built policy must not be able to smuggle the wildcard back in.
  assert.equal(isAquaTagMessageTrusted({ origin: "*", source: frameWindow, data }, { allowedOrigin: "*", frameWindow }), false);
  assert.equal(isAquaTagMessageTrusted({ origin: "null", source: frameWindow, data }, { allowedOrigin: "null", frameWindow }), false);
});

test("acceptAquaTagMessage checks where a message came from before believing it", () => {
  const frameWindow = { name: "preview-frame" };
  const policy = { allowedOrigin: aquaTagOrigin("https://client-site.com/"), frameWindow };

  const accepted = acceptAquaTagMessage({ origin: "https://client-site.com", source: frameWindow, data: textSelection() }, policy);
  assert.equal(accepted?.type, AQUA_TAG_MESSAGES.selected);

  // Perfectly valid payload, wrong sender.
  assert.equal(acceptAquaTagMessage({ origin: "https://attacker.com", source: frameWindow, data: textSelection() }, policy), null);
  assert.equal(acceptAquaTagMessage({ origin: "https://client-site.com", source: { name: "other" }, data: textSelection() }, policy), null);
  // Right sender, junk payload — the noise a window receives from extensions.
  assert.equal(acceptAquaTagMessage({ origin: "https://client-site.com", source: frameWindow, data: { type: "webpackHotUpdate" } }, policy), null);
});
