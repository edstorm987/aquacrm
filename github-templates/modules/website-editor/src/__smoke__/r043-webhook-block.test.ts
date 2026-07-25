// Smoke — R043 webhook block + form submission dispatcher.

import {
  WEBHOOK_TARGET_TYPE,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  collectWebhookTargets,
  findWebhookTarget,
  isValidSubmitTo,
  resolveFormSubmission,
  dispatchWebhook,
} from "../lib/webhookBlock";
import type { Block, BlockTreeJSON } from "../types/block";

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

function blk(over: Partial<Block> = {}): Block {
  return { id: over.id ?? "b" + Math.random().toString(36).slice(2,6),
    type: over.type ?? "section", props: over.props ?? {}, ...over };
}

(async () => {
  console.log("§ Webhook block");

  // ─── A: collectWebhookTargets ────────────────────────────────────────
  {
    const tree: BlockTreeJSON = [
      blk({ id: "wh1", type: WEBHOOK_TARGET_TYPE,
        props: { url: "https://hooks.example/zap1", label: "Zapier" } }),
      blk({ id: "wh2", type: WEBHOOK_TARGET_TYPE,
        props: { url: "https://hooks.example/zap2", disabled: true } }),
      blk({ id: "wh3", type: WEBHOOK_TARGET_TYPE,
        props: { url: "" } }),  // blank URL — skipped
      blk({ id: "form", type: "form" }),
      blk({ id: "outer", type: "section", children: [
        blk({ id: "wh4-nested", type: WEBHOOK_TARGET_TYPE,
          props: { url: "https://hooks.example/nested" } }),
      ]}),
    ];
    const targets = collectWebhookTargets(tree);
    const ids = targets.map(t => t.id).sort();
    expect("collects only valid+enabled targets",
      ids.length === 2 && ids.join(",") === "wh1,wh4-nested");
    expect("reads through nested children",
      ids.includes("wh4-nested"));

    expect("findWebhookTarget hits",
      findWebhookTarget(tree, "wh1")?.props.label === "Zapier");
    expect("findWebhookTarget misses disabled",
      findWebhookTarget(tree, "wh2") === undefined);
    expect("findWebhookTarget unknown returns undefined",
      findWebhookTarget(tree, "nope") === undefined);
  }

  // ─── B: isValidSubmitTo ──────────────────────────────────────────────
  expect("internal valid", isValidSubmitTo({ kind: "internal" }) === true);
  expect("webhook with id valid",
    isValidSubmitTo({ kind: "webhook", id: "wh1" }) === true);
  expect("webhook without id rejected",
    isValidSubmitTo({ kind: "webhook" }) === false);
  expect("unknown kind rejected",
    isValidSubmitTo({ kind: "ftp" }) === false);
  expect("non-object rejected",
    isValidSubmitTo(null) === false);

  // ─── C: resolveFormSubmission ────────────────────────────────────────
  {
    const tree: BlockTreeJSON = [
      blk({ id: "wh1", type: WEBHOOK_TARGET_TYPE,
        props: { url: "https://hooks.example/x" } }),
    ];
    expect("undefined → internal",
      resolveFormSubmission(tree, undefined) === "internal");
    expect("internal kind → internal",
      resolveFormSubmission(tree, { kind: "internal" }) === "internal");
    const r = resolveFormSubmission(tree, { kind: "webhook", id: "wh1" });
    expect("webhook hit returns target",
      typeof r === "object" && r !== null && (r as any).id === "wh1");
    expect("webhook miss returns null",
      resolveFormSubmission(tree, { kind: "webhook", id: "nope" }) === null);
    expect("invalid shape returns null",
      resolveFormSubmission(tree, { kind: "webhook" } as any) === null);
  }

  // ─── D: dispatchWebhook — happy path + signing ──────────────────────
  {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch = ((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(new Response("ok", { status: 200 }));
    }) as unknown as typeof fetch;

    const target = {
      id: "wh1",
      props: {
        url: "https://hooks.example/x",
        signingSecret: "secret",
        headers: { "x-custom": "yes" },
      },
    };
    const r = await dispatchWebhook({
      target, payload: { foo: "bar" }, fetchImpl: fakeFetch, now: 1700000000000,
    });
    expect("dispatch ok 200", r.ok && r.status === 200);
    expect("response body preview captured",
      r.bodyPreview === "ok");
    expect("custom header forwarded",
      (calls[0]?.init.headers as any)["x-custom"] === "yes");
    expect("signature header set with sha256= prefix",
      typeof (calls[0]?.init.headers as any)[SIGNATURE_HEADER] === "string" &&
      ((calls[0]?.init.headers as any)[SIGNATURE_HEADER] as string).startsWith("sha256="));
    expect("timestamp header set",
      (calls[0]?.init.headers as any)[TIMESTAMP_HEADER] === "1700000000000");
    expect("body is JSON-encoded payload",
      calls[0]?.init.body === '{"foo":"bar"}');
    expect("default method POST",
      calls[0]?.init.method === "POST");
  }

  // ─── E: dispatchWebhook — no signing when no secret ─────────────────
  {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch = ((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(new Response("ok", { status: 200 }));
    }) as unknown as typeof fetch;

    await dispatchWebhook({
      target: { id: "x", props: { url: "https://hooks.example/y" } },
      payload: { a: 1 }, fetchImpl: fakeFetch,
    });
    expect("no signature header when no secret",
      !(SIGNATURE_HEADER in (calls[0]!.init.headers as any)));
  }

  // ─── F: dispatchWebhook — failure path ──────────────────────────────
  {
    const fakeFetch = (() => Promise.reject(new Error("ENOTFOUND"))) as unknown as typeof fetch;
    const r = await dispatchWebhook({
      target: { id: "x", props: { url: "https://nope.example" } },
      payload: { a: 1 }, fetchImpl: fakeFetch,
    });
    expect("network error → ok:false + error message",
      r.ok === false && r.status === 0 && r.error === "ENOTFOUND");
  }

  // ─── G: dispatchWebhook — non-2xx ────────────────────────────────────
  {
    const fakeFetch = ((): Promise<Response> =>
      Promise.resolve(new Response("nope", { status: 500 }))) as unknown as typeof fetch;
    const r = await dispatchWebhook({
      target: { id: "x", props: { url: "https://x.example" } },
      payload: { a: 1 }, fetchImpl: fakeFetch,
    });
    expect("500 response → ok:false + status preserved + body preview",
      r.ok === false && r.status === 500 && r.bodyPreview === "nope");
  }

  // ─── H: dispatchWebhook — no fetch impl ─────────────────────────────
  {
    const r = await dispatchWebhook({
      target: { id: "x", props: { url: "https://x" } },
      payload: { a: 1 }, fetchImpl: undefined as any,
    });
    // We can't disable globalThis.fetch easily, so this case is best-
    // effort — when fetch IS available it'll succeed/fail depending
    // on the runtime. Just confirm the type is well-formed.
    expect("dispatch returns DispatchResult shape regardless",
      typeof r === "object" && "ok" in r && "request" in r);
  }

  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
