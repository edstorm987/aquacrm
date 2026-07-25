// Server-rendered Contacts page — CSV import + contact list.
// Mounted at `/portal/agency/leads-pipeline/contacts`.

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { ContactsWorkspace } from "@/app/portal/agency/leads-pipeline/contacts/_ContactsWorkspace";

export default async function ContactsPage(props: PluginPageProps) {
  const { contacts, leads } = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
  });
  const [contactList, leadList] = await Promise.all([
    contacts.list(),
    leads.list(),
  ]);

  return <ContactsWorkspace contacts={contactList} leads={leadList} />;
}
