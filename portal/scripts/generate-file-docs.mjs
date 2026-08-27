// Compatibility entry point retained for older runbooks and worker commands.
// The file graph and symbol map are now one consolidated generator: eight large
// area volumes plus a master index, with no per-source Markdown stub tree.

console.warn("File docs are consolidated into the source-reference volumes; running the unified generator.");
await import("./generate-symbol-reference.mjs");
