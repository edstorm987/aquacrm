/**
 * The Aqua Tag handshake, after a ping goes unanswered.
 *
 * ── The defect this rule closes (issue #19, browser half) ───────────────────
 *
 * The editor pinged the tag from the preview iframe's `load` event and from
 * nowhere else. The studio is server-rendered, so the iframe is in the HTML
 * and starts loading before React hydrates; a page that finishes loading
 * first fires `load` before the `onLoad` handler exists, and that event is
 * gone. Nothing pinged, the bridge stayed "idle", the badge stayed blank, and
 * selection never worked until the operator pressed Refresh — reproduced on a
 * real Chromium: a frame delayed past hydration connected, the same frame
 * loading promptly never did.
 *
 * So the editor now also pings once the trusted origin is known, before any
 * `load` has been observed. That ping is BLIND: the page may already be there
 * (the missed-load case) or may still be loading (the ordinary case), and
 * silence means different things in the two. This rule says what to do with
 * silence, and it is pure so the choice can be proven without a browser:
 *
 *   • the frame has reported `load` and still did not answer → "unavailable",
 *     exactly as before. A loaded page with no tag is a page with no tag.
 *   • no `load` has been seen and blind pings remain → "retry". The page is
 *     probably still loading; calling it "no tag" now would be a false
 *     negative that the `load` handler would later contradict.
 *   • no `load` has been seen and the blind budget is spent → "unavailable".
 *     Either the load was missed and the page carries no tag, or the page is
 *     taking so long that "not answering" is the honest sentence. Never
 *     "checking" forever: an unbounded wait is the other way to lie.
 *
 * A `load` that arrives later pings again with a fresh request id, so every
 * earlier timeout bails on the id check and the answer wins whenever it comes.
 */

/** How long one ping waits before the silence is judged. */
export const TAG_HANDSHAKE_PING_TIMEOUT_MS = 2_000;

/**
 * How many pings may go unanswered before a `load` has been observed.
 *
 * Three blind pings at two seconds each bound the wait at six seconds — long
 * enough for a slow first paint of a real site, short enough that a tagless
 * page still gets its honest verdict.
 */
export const TAG_HANDSHAKE_MAX_BLIND_PINGS = 3;

export type TagHandshakeSilence = "retry" | "unavailable";

export interface TagHandshakeSilenceInput {
  /** Whether the preview frame has fired `load` since it was (re)mounted. */
  frameLoaded: boolean;
  /** Zero-based: how many pings have already gone unanswered before this one. */
  attempt: number;
  maxBlindPings?: number;
}

export function handshakeAfterSilence(input: TagHandshakeSilenceInput): TagHandshakeSilence {
  const budget = input.maxBlindPings ?? TAG_HANDSHAKE_MAX_BLIND_PINGS;
  if (input.frameLoaded) return "unavailable";
  return input.attempt + 1 < budget ? "retry" : "unavailable";
}
