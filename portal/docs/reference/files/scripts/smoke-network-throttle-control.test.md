# `scripts/smoke-network-throttle-control.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Smoke — the wifi throttle control (SOURCE-SHAPE pins). Full suite: PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' npx tsx --test scripts/*.test.ts  § `NetworkThrottleControl` is a client component, and this suite runs under `--conditions react-server`, so the pins here are against the source text — the same approach as smoke-aqua-editor-ai-ui.test.ts. The BEHAVIOUR (real latency, pacing, offline, restore) is proved by executing the tag itself in scripts/smoke-aqua-tag-throttle.test.ts; this file pins what the control SAYS and how it is allowed to say it: • the honesty sentence — script requests only, page loads are DevTools' job • the DevTools-shaped preset numbers Ed asked for • protocol discipline — the builder, never a retyped message literal • truth rendering — amber comes from the tag's ack, never from our request • the editor's vocabulary — dark, border-white/10, focus-visible, no --dt-*

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

