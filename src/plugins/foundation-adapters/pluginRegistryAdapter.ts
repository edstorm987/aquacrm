import "server-only";
import { listPlugins, getPlugin, listInstallablePlugins } from "@/plugins/_registry";
import type { AquaPlugin } from "@/plugins/_types";
import type { PluginRegistryEntry, PluginRegistryPort } from "@/plugins/_types";

function toEntry(p: AquaPlugin): PluginRegistryEntry {
  return {
    id: p.id,
    name: p.name,
    version: p.version,
    status: p.status,
    category: p.category,
    tagline: p.tagline,
    description: p.description,
    core: p.core,
    requires: p.requires,
    conflicts: p.conflicts,
  };
}

export const pluginRegistryAdapter: PluginRegistryPort = {
  listPlugins() { return listPlugins().map(toEntry); },
  listInstallablePlugins() { return listInstallablePlugins().map(toEntry); },
  getPlugin(id: string) {
    const p = getPlugin(id);
    return p ? toEntry(p) : null;
  },
};
