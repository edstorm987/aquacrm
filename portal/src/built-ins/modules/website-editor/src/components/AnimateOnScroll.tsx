"use client";

// The directive stays on this re-export shim, not only on the
// implementation: this path carried it before the move (it mounts an IntersectionObserver),
// and dropping it would move what this module pulls in from the client
// graph to whichever graph the importer happens to be in.

// On-scroll entrance animation wrapper.
//
// Implementation moved to `src/engines/editor/elements/AnimateOnScroll.tsx` alongside the
// renderer that mounts it. Re-exported here verbatim.

export { default } from "@/engines/editor/elements/AnimateOnScroll";
