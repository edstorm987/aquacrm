// The Aqua Tag handshake after silence — issue #19's browser half.
//
// The editor used to ping the tag only from the preview iframe's `load` event.
// A server-rendered frame that finishes loading before hydration fires `load`
// before React has attached `onLoad`, so that ping never happened: the badge
// stayed blank and nothing selected until the operator pressed Refresh
// (reproduced on a real Chromium — a frame delayed past hydration connected,
// the same frame loading promptly never did). The editor now pings blind once
// the trusted origin is known, and THIS rule decides what an unanswered blind
// ping means. It is pure so the three outcomes can be proven without a browser.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  TAG_HANDSHAKE_MAX_BLIND_PINGS,
  TAG_HANDSHAKE_PING_TIMEOUT_MS,
  handshakeAfterSilence,
} from "../src/engines/editor/editing/tagHandshake";

const DEV_EDITOR = readFileSync(new URL("../src/engines/editor/DevEditor.tsx", import.meta.url), "utf8");

test("a loaded page that did not answer has no tag", () => {
  assert.equal(handshakeAfterSilence({ frameLoaded: true, attempt: 0 }), "unavailable");
  assert.equal(handshakeAfterSilence({ frameLoaded: true, attempt: 2 }), "unavailable");
});

test("silence before `load` is asked again, within a bounded budget", () => {
  assert.equal(handshakeAfterSilence({ frameLoaded: false, attempt: 0 }), "retry");
  assert.equal(handshakeAfterSilence({ frameLoaded: false, attempt: TAG_HANDSHAKE_MAX_BLIND_PINGS - 2 }), "retry");
  // The last blind ping is judged, never re-asked: "checking" forever is a lie.
  assert.equal(handshakeAfterSilence({ frameLoaded: false, attempt: TAG_HANDSHAKE_MAX_BLIND_PINGS - 1 }), "unavailable");
  assert.equal(handshakeAfterSilence({ frameLoaded: false, attempt: 0, maxBlindPings: 1 }), "unavailable");
});

test("the blind wait is bounded to a few seconds, not indefinite", () => {
  assert.ok(TAG_HANDSHAKE_MAX_BLIND_PINGS >= 2, "one blind ping cannot cover a slow first paint");
  assert.ok(TAG_HANDSHAKE_MAX_BLIND_PINGS * TAG_HANDSHAKE_PING_TIMEOUT_MS <= 10_000, "a tagless page must get its verdict within ten seconds");
});

test("the editor pings once the origin is known, not only on `load`, and judges silence through the rule", () => {
  // The blind ping: keyed on the frame's identity, guarded on a frame existing.
  assert.match(DEV_EDITOR, /useEffect\(\(\) => \{\s*frameLoaded\.current = false;\s*if \(portalTarget \|\| !tagOrigin \|\| !previewRef\.current\) return;\s*pingTag\(\);[\s\S]*?\}, \[tagOrigin, previewSrc, frameKey, portalTarget\]\);/);
  // `load` still pings — and records that it happened, which is what the rule reads.
  assert.match(DEV_EDITOR, /onLoad=\{\(\) => \{ frameLoaded\.current = true; pingTag\(\); \}\}/);
  assert.match(DEV_EDITOR, /handshakeAfterSilence\(\{ frameLoaded: frameLoaded\.current, attempt \}\) === "retry"/);
  assert.doesNotMatch(DEV_EDITOR, /onLoad=\{pingTag\}/, "a bare load handler cannot record that the load happened");
});
