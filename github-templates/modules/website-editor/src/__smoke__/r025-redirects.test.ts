// Smoke — R025 Redirect registry.

import {
  listRedirects, addRedirect, removeRedirect, resolveRedirect,
  RedirectLoopError, REDIRECTS_CAP,
} from "../server/redirects";
import {
  handleListRedirects, handleAddRedirect, handleRemoveRedirect, handleResolveRedirect,
} from "../api/handlers/redirects";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { AgencyId, ClientId } from "../lib/tenancy";

function memStorage(): PluginStorage {
  const m = new Map<string, unknown>();
  return {
    async get<T>(k: string) { return m.get(k) as T | undefined; },
    async set(k, v) { m.set(k, v); },
    async del(k) { m.delete(k); },
    async list(prefix = "") { return [...m.keys()].filter(k => k.startsWith(prefix)); },
  };
}

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

const a = "ag_smoke" as AgencyId;
const c = "cl_smoke" as ClientId;
const siteId = "site_smoke";

(async () => {
  expect("REDIRECTS_CAP = 100", REDIRECTS_CAP === 100);

  // ─── A: addRedirect basics ─────────────────────────────────────────────
  const storage = memStorage();
  const r1 = await addRedirect(storage, {
    agencyId: a, clientId: c, siteId, from: "/old", to: "/new", reason: "rename",
  });
  expect("addRedirect normalises leading slash + reason set",
    r1.entry.from === "/old" && r1.entry.to === "/new" && r1.entry.reason === "rename");

  // No leading slash → normalised.
  const r1b = await addRedirect(storage, {
    agencyId: a, clientId: c, siteId, from: "older", to: "/new",
  });
  expect("addRedirect prepends slash when missing",
    r1b.entry.from === "/older");

  const list1 = await listRedirects(storage, a, c, siteId);
  expect("listRedirects returns 2 entries newest-first",
    list1.length === 2 && list1[0]!.from === "/older");

  // ─── B: self-loop rejected ─────────────────────────────────────────────
  let caught: unknown = null;
  try {
    await addRedirect(storage, { agencyId: a, clientId: c, siteId, from: "/x", to: "/x" });
  } catch (e) { caught = e; }
  expect("self-loop throws RedirectLoopError",
    caught instanceof RedirectLoopError);

  // ─── C: chain shortening ───────────────────────────────────────────────
  // Existing /old → /new. Now rename /new → /newer.
  const r2 = await addRedirect(storage, {
    agencyId: a, clientId: c, siteId, from: "/new", to: "/newer", reason: "rename",
  });
  expect("chain shortening rewrote 2 existing entries pointing to /new",
    r2.rewroteChain === 2);
  const list2 = await listRedirects(storage, a, c, siteId);
  // /old and /older should now point to /newer (not /new).
  expect("/old now points to /newer",
    list2.find(e => e.from === "/old")?.to === "/newer");
  expect("/older now points to /newer",
    list2.find(e => e.from === "/older")?.to === "/newer");

  // ─── D: re-add same `from` collapses ──────────────────────────────────
  // Re-rename /old → /finalest.
  const r3 = await addRedirect(storage, {
    agencyId: a, clientId: c, siteId, from: "/old", to: "/finalest",
  });
  expect("re-add same from collapses (no duplicate)", r3.entry.to === "/finalest");
  const list3 = await listRedirects(storage, a, c, siteId);
  expect("only one entry with from='/old'",
    list3.filter(e => e.from === "/old").length === 1);

  // ─── E: resolveRedirect ────────────────────────────────────────────────
  expect("resolve unknown slug → null",
    resolveRedirect(list3, "/nonexistent") === null);
  expect("resolve known slug returns target",
    resolveRedirect(list3, "/old") === "/finalest");
  // Tolerate missing leading slash on input.
  expect("resolve normalises input slug",
    resolveRedirect(list3, "old") === "/finalest");

  // Multi-hop chain (manual setup).
  const chained = [
    { from: "/a", to: "/b", ts: 1, reason: "rename" as const },
    { from: "/b", to: "/c", ts: 2, reason: "rename" as const },
    { from: "/c", to: "/d", ts: 3, reason: "rename" as const },
  ];
  expect("resolve walks chain to final target",
    resolveRedirect(chained, "/a") === "/d");

  // ─── F: capacity trim ──────────────────────────────────────────────────
  const stCap = memStorage();
  for (let i = 0; i < 105; i++) {
    await addRedirect(stCap, {
      agencyId: a, clientId: c, siteId, from: `/old-${i}`, to: `/new-${i}`,
    });
  }
  const capList = await listRedirects(stCap, a, c, siteId);
  expect("capacity trim caps at REDIRECTS_CAP",
    capList.length === REDIRECTS_CAP);
  // Newest entry retained (head).
  expect("newest entry retained at head",
    capList[0]!.from === "/old-104");
  // Oldest dropped.
  expect("oldest entry pruned",
    !capList.some(e => e.from === "/old-0"));

  // ─── G: removeRedirect ────────────────────────────────────────────────
  const removed = await removeRedirect(stCap, a, c, siteId, "/old-50");
  expect("removeRedirect returns true on hit", removed);
  const removedMiss = await removeRedirect(stCap, a, c, siteId, "/nope");
  expect("removeRedirect returns false on miss", !removedMiss);

  // ─── H: HTTP handlers ─────────────────────────────────────────────────
  const ctxStorage = memStorage();
  const ctx = {
    agencyId: a, clientId: c, actor: "u_smoke",
    storage: ctxStorage,
    services: {} as Record<string, unknown>,
    install: { config: {} },
  } as unknown as Parameters<typeof handleListRedirects>[1];

  // POST add.
  const post = await handleAddRedirect(new Request("http://x/redirects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ siteId, from: "/old", to: "/new" }),
  }), ctx);
  expect("POST /redirects 201", post.status === 201);

  // POST self-loop → 409.
  const loop = await handleAddRedirect(new Request("http://x/redirects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ siteId, from: "/loop", to: "/loop" }),
  }), ctx);
  expect("POST self-loop → 409", loop.status === 409);

  // POST 400 missing siteId / from / to.
  const noSite = await handleAddRedirect(new Request("http://x/redirects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ from: "/x", to: "/y" }),
  }), ctx);
  expect("POST without siteId → 400", noSite.status === 400);

  // GET list.
  const lst = await handleListRedirects(new Request(`http://x/redirects?siteId=${siteId}`), ctx);
  expect("GET /redirects 200", lst.status === 200);
  const lstBody = await lst.json() as { redirects: { from: string; to: string }[] };
  expect("GET surfaces 1 redirect",
    lstBody.redirects.length === 1 && lstBody.redirects[0]!.from === "/old");

  // GET resolve hit + miss.
  const res200 = await handleResolveRedirect(
    new Request(`http://x/redirects/resolve?siteId=${siteId}&slug=/old`), ctx,
  );
  const res200Body = await res200.json() as { target: string | null };
  expect("resolve hit returns target", res200Body.target === "/new");

  const resMiss = await handleResolveRedirect(
    new Request(`http://x/redirects/resolve?siteId=${siteId}&slug=/nope`), ctx,
  );
  const resMissBody = await resMiss.json() as { target: string | null };
  expect("resolve miss returns null target", resMissBody.target === null);

  // DELETE 200 + 404.
  const del = await handleRemoveRedirect(
    new Request(`http://x/redirects?siteId=${siteId}&from=/old`, { method: "DELETE" }), ctx,
  );
  expect("DELETE 200", del.status === 200);
  const del404 = await handleRemoveRedirect(
    new Request(`http://x/redirects?siteId=${siteId}&from=/nope`, { method: "DELETE" }), ctx,
  );
  expect("DELETE unknown → 404", del404.status === 404);

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
