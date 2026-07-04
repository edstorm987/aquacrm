import "server-only";
// Foundation-level Vercel domain-attach API client (server-only
// re-export).
//
// Application code imports from this module — the `import
// "server-only"` ensures Next.js refuses to bundle it client-side.
// All logic lives in `vercelDomain.impl.ts`; the impl has no
// `server-only` guard so the smoke at
// `scripts/smoke-vercel-domain.test.ts` can drive it via tsx.

export * from "./vercelDomain.impl";
