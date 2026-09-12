// Server-rendered Contacts page — CSV import + contact list.
// Mounted at `/portal/agency/leads-pipeline/contacts`.

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { ContactsWorkspace } from "@/app/portal/agency/leads-pipeline/contacts/_ContactsWorkspace";
import type { CustomFieldDefinition } from "../lib/domain";
import { getPortalFormFields } from "@/server/portalEditor";

export default async function ContactsPage(props: PluginPageProps) {
  const { contacts, leads } = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
  });
  const [contactList, leadList, customFields, customTags] = await Promise.all([
    contacts.list(),
    leads.list(),
    props.storage.get<CustomFieldDefinition[]>("contacts/custom-field-definitions"),
    props.storage.get<string[]>("contacts/custom-tags"),
  ]);

  return (
    <ContactsWorkspace
      referenceNow={Date.now()}
      contacts={contactList}
      leads={leadList.map(lead => ({
        ...lead,
        // Keep the structured dossier server-side; the browser needs only the
        // trusted backlink used by suppression-aware outreach routes.
        prospectId: lead.prospectAcquisitions?.[0]?.prospectId,
      }))}
      initialCustomFields={customFields ?? []}
      initialLeadFields={getPortalFormFields(props.agencyId, "leads")}
      initialCustomTags={customTags ?? []}
      initialImportOpen={props.searchParams.import === "1"}
    />
  );
}
