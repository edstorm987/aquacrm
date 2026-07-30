// Server-rendered Contacts page — CSV import + contact list.
// Mounted at `/portal/agency/leads-pipeline/contacts`.

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { ContactsWorkspace } from "@/app/portal/agency/leads-pipeline/contacts/_ContactsWorkspace";
import type { CustomFieldDefinition } from "../lib/domain";

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
      contacts={contactList}
      leads={leadList}
      initialCustomFields={customFields ?? []}
      initialCustomTags={customTags ?? []}
      initialImportOpen={props.searchParams.import === "1"}
    />
  );
}
