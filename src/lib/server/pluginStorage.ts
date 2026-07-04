import "server-only";
// Per-install plugin storage namespace — same shape `_runtime.ts` uses
// inside its own makeCtx, hoisted here so route handlers + page wrappers
// can build a `PluginStorage` without tripping on the runtime module.

import { getState, mutate } from "@/server/storage";
import type { PluginStorage } from "@/plugins/_types";

export function makePluginStorage(installId: string): PluginStorage {
  return {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      const data = (getState().pluginData[installId] ?? {}) as Record<string, unknown>;
      return data[key] as T | undefined;
    },
    async set<T = unknown>(key: string, value: T): Promise<void> {
      mutate(state => {
        if (!state.pluginData[installId]) state.pluginData[installId] = {};
        state.pluginData[installId][key] = value;
      });
    },
    async del(key: string): Promise<void> {
      mutate(state => {
        const slice = state.pluginData[installId];
        if (!slice) return;
        delete slice[key];
      });
    },
    async list(prefix?: string): Promise<string[]> {
      const data = (getState().pluginData[installId] ?? {}) as Record<string, unknown>;
      const keys = Object.keys(data);
      return prefix ? keys.filter(k => k.startsWith(prefix)) : keys;
    },
  };
}
