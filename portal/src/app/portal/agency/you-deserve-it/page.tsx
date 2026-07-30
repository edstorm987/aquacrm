import { requireRole } from "@/lib/server/auth";
import { listClientDelight } from "@/server/clientDelight";
import { ensureHydrated } from "@/server/storage";
import { listClients } from "@/server/tenants";
import { AGENCY_ROLES } from "@/server/types";
import { YouDeserveItWorkspace } from "./_YouDeserveItWorkspace";

export default async function YouDeserveItPage() {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  const clients = listClients(session.agencyId)
    .filter(client => client.status === "active")
    .map(client => ({ id: client.id, name: client.name }));
  return <YouDeserveItWorkspace initialRecords={listClientDelight(session.agencyId)} clients={clients} />;
}
