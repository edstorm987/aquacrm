// Server-rendered Campaigns page — list + new + send.
// Mounted at `/portal/agency/leads-pipeline/campaigns`.

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { getPipelineBySlug } from "@/server/pipelines";
import { CampaignsWorkspace } from "@/app/portal/agency/leads-pipeline/campaigns/_CampaignsWorkspace";
import { getInstall } from "@/server/pluginInstalls";
import { installPlugin, setPluginEnabled } from "@/built-ins/runtime/_runtime";

const EMAIL_SENDER_PLUGIN_ID = "email-sender";

export default async function CampaignsPage(props: PluginPageProps) {
  let emailSenderInstall = getInstall({ agencyId: props.agencyId }, EMAIL_SENDER_PLUGIN_ID);
  if (!emailSenderInstall) {
    const result = await installPlugin(EMAIL_SENDER_PLUGIN_ID, {
      scope: { agencyId: props.agencyId },
      installedBy: props.actor,
    });
    if (result.ok) emailSenderInstall = result.install;
  } else if (!emailSenderInstall.enabled) {
    await setPluginEnabled({ agencyId: props.agencyId }, EMAIL_SENDER_PLUGIN_ID, true);
    emailSenderInstall = getInstall({ agencyId: props.agencyId }, EMAIL_SENDER_PLUGIN_ID);
  }

  const { campaigns, leads } = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
  });
  const [list, leadList] = await Promise.all([campaigns.list(), leads.list()]);
  const availableTags = Array.from(new Set(leadList.flatMap(lead => lead.tags))).sort();
  const availableSources = Array.from(new Set(leadList.map(lead => lead.source))).sort();
  const pipeline = getPipelineBySlug(props.agencyId, "leads");
  const pipelineColumns = pipeline?.columns.map(col => col.label) ?? ["New", "Contacted", "Qualified", "Won", "Lost"];

  return (
    <CampaignsWorkspace
      campaigns={list}
      availableTags={availableTags}
      availableSources={availableSources}
      pipelineColumns={pipelineColumns}
      emailSenderReady={Boolean(emailSenderInstall?.enabled)}
    />
  );
}
