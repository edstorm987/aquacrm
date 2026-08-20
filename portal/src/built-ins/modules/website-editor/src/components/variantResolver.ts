"use client";

// The directive stays on this re-export shim, not only on the
// implementation: this path carried it before the move (it reads localStorage / sessionStorage),
// and dropping it would move what this module pulls in from the client
// graph to whichever graph the importer happens to be in.

// Runtime variant resolver for split-tests (X-2).
//
// Implementation moved to `src/engines/editor/elements/variantResolver.ts` alongside the
// renderer that calls it. Re-exported here verbatim.

export { applyVariant, recordConversion, recordExposure, resolveVariant, sessionId, visitorId } from "@/engines/editor/elements/variantResolver";
export type { ResolvedVariant } from "@/engines/editor/elements/variantResolver";
