import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import { captureHandler, runHandler } from "./handlers";

export const ROUTES: PluginApiRoute[] = [
  // Both routes are PUBLIC — the tool runs without auth, capture
  // creates the lead which is the moment the visitor signs in.
  { path: "run",     methods: ["POST"], handler: runHandler,     public: true },
  { path: "capture", methods: ["POST"], handler: captureHandler, public: true },
];
