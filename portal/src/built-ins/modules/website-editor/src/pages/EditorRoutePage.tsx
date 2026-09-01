// Server-side plugin entry. The foundation supplies its storage and service
// adapters here; the visual editor itself works through scoped HTTP APIs and
// must not receive those function-bearing adapters across the client boundary.

import type { PluginPageProps } from "@/built-ins/runtime/_types";
import VisualEditorPage from "./EditorPage";
import { resolveEnabledPluginIds } from "../server/pluginAvailability";

export default async function EditorRoutePage(props: PluginPageProps) {
  const enabledPluginIds = await resolveEnabledPluginIds(
    props.services.pluginInstalls,
    {
      agencyId: props.agencyId,
      ...(props.clientId !== undefined ? { clientId: props.clientId } : {}),
    },
  );

  return <VisualEditorPage enabledPluginIds={enabledPluginIds} />;
}
