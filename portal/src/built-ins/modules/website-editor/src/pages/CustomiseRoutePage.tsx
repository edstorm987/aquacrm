import { describePluginSettings } from "@/lib/server/plugins/pluginSettingsSurface";
import { canEditPluginSettings } from "@/lib/server/plugins/pluginSettingsAccess";
import type { PluginPageProps } from "../lib/aquaPluginTypes";
import EditorSettingsPage from "./CustomisePage";

/** Server boundary for the client-side editor-preference controls. */
export default async function CustomiseRoutePage(props: PluginPageProps) {
  if (!props.clientId) return <p>Website Editor requires a client scope.</p>;

  const canEdit = await canEditPluginSettings();
  const settings = describePluginSettings(props.install.pluginId, {
    agencyId: props.agencyId,
    clientId: props.clientId,
  });

  return (
    <EditorSettingsPage
      settings={settings}
      clientId={props.clientId}
      canEdit={canEdit}
    />
  );
}
