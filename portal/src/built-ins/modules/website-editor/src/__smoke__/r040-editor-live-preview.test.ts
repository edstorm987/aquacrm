// Smoke — R040 editor live-preview helpers.

import {
  mintLivePreviewToken,
  verifyLivePreviewToken,
  buildPreviewSrc,
  isTreeChangedMessage,
  isClickMessage,
  PREVIEW_MSG_TREE_CHANGED,
  PREVIEW_MSG_CLICK,
  readSplitPref,
  writeSplitPref,
} from "../lib/editorLivePreview";

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

const SECRET = "test-secret";

(async () => {
  console.log("§ Editor live preview");

  // ─── A: token roundtrip ──────────────────────────────────────────────
  {
    const t = await mintLivePreviewToken(SECRET, "page_1", "user_1");
    const v = await verifyLivePreviewToken(SECRET, t);
    expect("token roundtrip ok",
      v.ok === true && v.payload.pageId === "page_1" && v.payload.userId === "user_1");
    expect("token version is lp1",
      v.ok === true && v.payload.version === "lp1");
  }

  // ─── B: pageId / userId mismatch ─────────────────────────────────────
  {
    const t = await mintLivePreviewToken(SECRET, "p1", "u1");
    const wrongPage = await verifyLivePreviewToken(SECRET, t, { pageId: "p2" });
    expect("wrong pageId rejected",
      wrongPage.ok === false && wrongPage.reason === "wrong_page");
    const wrongUser = await verifyLivePreviewToken(SECRET, t, { userId: "u2" });
    expect("wrong userId rejected",
      wrongUser.ok === false && wrongUser.reason === "wrong_user");
    const okScoped = await verifyLivePreviewToken(SECRET, t, { pageId: "p1", userId: "u1" });
    expect("matching pageId+userId ok",
      okScoped.ok === true);
  }

  // ─── C: bad signature + malformed ────────────────────────────────────
  {
    const t = await mintLivePreviewToken(SECRET, "p1", "u1");
    const tampered = t.slice(0, -2) + "xx";
    const v = await verifyLivePreviewToken(SECRET, tampered);
    expect("tampered token → bad_signature",
      v.ok === false && v.reason === "bad_signature");

    const wrongSecret = await verifyLivePreviewToken("other", t);
    expect("wrong secret → bad_signature",
      wrongSecret.ok === false && wrongSecret.reason === "bad_signature");

    const noDot = await verifyLivePreviewToken(SECRET, "abc");
    expect("malformed token → malformed",
      noDot.ok === false && noDot.reason === "malformed");
  }

  // ─── D: expiry ───────────────────────────────────────────────────────
  {
    const t = await mintLivePreviewToken(SECRET, "p1", "u1", -1000);
    const v = await verifyLivePreviewToken(SECRET, t);
    expect("expired token rejected",
      v.ok === false && v.reason === "expired");
  }

  // ─── E: buildPreviewSrc ──────────────────────────────────────────────
  {
    expect("appends preview= on bare path",
      buildPreviewSrc("/about", "TOK") === "/about?preview=TOK");
    expect("preserves existing query",
      buildPreviewSrc("/x?utm=1", "TOK") === "/x?utm=1&preview=TOK");
    expect("idempotent — replaces existing preview= ",
      buildPreviewSrc(buildPreviewSrc("/x", "OLD"), "NEW") === "/x?preview=NEW");
    expect("preserves fragment",
      buildPreviewSrc("/x#top", "T") === "/x?preview=T#top");
    expect("encodes token chars",
      buildPreviewSrc("/x", "a/b") === "/x?preview=a%2Fb");
  }

  // ─── F: postMessage shapes ──────────────────────────────────────────
  {
    expect("isTreeChangedMessage accepts valid",
      isTreeChangedMessage({ type: PREVIEW_MSG_TREE_CHANGED, tree: [] }) === true);
    expect("isTreeChangedMessage rejects wrong type",
      isTreeChangedMessage({ type: "other", tree: [] }) === false);
    expect("isTreeChangedMessage rejects missing tree",
      isTreeChangedMessage({ type: PREVIEW_MSG_TREE_CHANGED }) === false);
    expect("isTreeChangedMessage rejects null",
      isTreeChangedMessage(null) === false);

    expect("isClickMessage accepts valid",
      isClickMessage({ type: PREVIEW_MSG_CLICK, blockId: "b1" }) === true);
    expect("isClickMessage rejects empty blockId",
      isClickMessage({ type: PREVIEW_MSG_CLICK, blockId: "" }) === false);
    expect("isClickMessage rejects non-string blockId",
      isClickMessage({ type: PREVIEW_MSG_CLICK, blockId: 1 }) === false);
    expect("isClickMessage rejects wrong type",
      isClickMessage({ type: "click", blockId: "b1" }) === false);
  }

  // ─── G: split-pref persistence ───────────────────────────────────────
  {
    const store = new Map<string, string>();
    const fake = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
    };
    expect("readSplitPref defaults to false",
      readSplitPref(fake) === false);
    writeSplitPref(true, fake);
    expect("write+read true",
      readSplitPref(fake) === true);
    writeSplitPref(false, fake);
    expect("write+read false",
      readSplitPref(fake) === false);
    expect("readSplitPref handles missing storage",
      readSplitPref({ getItem: () => null }) === false);
  }

  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
