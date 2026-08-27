import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth/auth";
import { AGENCY_ROLES } from "@/server/types";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { cleanClientContacts, type ClientContact, type ClientEntityType } from "@/lib/clients/clientContacts";
import { logActivity } from "@/server/activity";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";

type Action = "save" | "delete" | "set-primary" | "set-entity-type";

interface Body {
  clientId?: unknown;
  action?: unknown;
  contactId?: unknown;
  entityType?: unknown;
  contact?: {
    id?: unknown;
    name?: unknown;
    email?: unknown;
    phone?: unknown;
    role?: unknown;
    notes?: unknown;
    primary?: unknown;
  };
}

export async function POST(req: Request) {
  await ensureHydrated();
  const body = await req.json().catch(() => null) as Body | null;
  const clientId = clean(body?.clientId, 120);
  const action = clean(body?.action, 40) as Action;
  if (!clientId || !["save", "delete", "set-primary", "set-entity-type"].includes(action)) {
    return NextResponse.json({ ok: false, error: "clientId and valid action required" }, { status: 400 });
  }

  let session;
  try {
    session = await requireRoleForClient([...AGENCY_ROLES], clientId);
    await requireCurrentClientWorkspaceElementAccess(clientId, "client.record", "use");
  } catch (error) {
    return authErrorResponse(error);
  }
  const client = getClientForAgency(session.agencyId, clientId);
  if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });

  const metadata = client.metadata ?? {};
  let contacts = cleanClientContacts(metadata.linkedContacts);
  let entityType: ClientEntityType = metadata.clientEntityType === "person" ? "person" : "company";
  let message = "";

  if (action === "set-entity-type") {
    entityType = body?.entityType === "person" ? "person" : "company";
    message = `Changed ${client.name} to a ${entityType} client.`;
  } else if (action === "save") {
    const name = clean(body?.contact?.name, 120);
    if (!name) return NextResponse.json({ ok: false, error: "contact name required" }, { status: 400 });
    const now = Date.now();
    const existingId = clean(body?.contact?.id, 120);
    const existing = contacts.find(contact => contact.id === existingId);
    const contact: ClientContact = {
      id: existing?.id ?? `contact_${randomUUID()}`,
      name,
      email: clean(body?.contact?.email, 240) || undefined,
      phone: clean(body?.contact?.phone, 80) || undefined,
      role: clean(body?.contact?.role, 100) || undefined,
      notes: clean(body?.contact?.notes, 1_000) || undefined,
      primary: body?.contact?.primary === true || (!contacts.length && !existing),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    if (contact.primary) contacts = contacts.map(item => ({ ...item, primary: false }));
    contacts = existing
      ? contacts.map(item => item.id === existing.id ? contact : item)
      : [contact, ...contacts];
    message = `${existing ? "Updated" : "Added"} contact ${contact.name} for ${client.name}.`;
  } else {
    const contactId = clean(body?.contactId, 120);
    const target = contacts.find(contact => contact.id === contactId);
    if (!target) return NextResponse.json({ ok: false, error: "contact not found" }, { status: 404 });
    if (action === "delete") {
      contacts = contacts.filter(contact => contact.id !== contactId);
      if (target.primary && contacts.length) contacts[0] = { ...contacts[0], primary: true, updatedAt: Date.now() };
      message = `Removed contact ${target.name} from ${client.name}.`;
    } else {
      contacts = contacts.map(contact => ({ ...contact, primary: contact.id === contactId, updatedAt: contact.id === contactId ? Date.now() : contact.updatedAt }));
      message = `${target.name} is now the primary contact for ${client.name}.`;
    }
  }

  const primary = contacts.find(contact => contact.primary);
  const updated = updateClient(session.agencyId, clientId, {
    ownerEmail: primary?.email ?? client.ownerEmail,
    metadata: {
      clientEntityType: entityType,
      linkedContacts: contacts,
      contactName: primary?.name ?? metadata.contactName,
      clientEmail: primary?.email ?? metadata.clientEmail,
      portalContactName: primary?.name ?? metadata.portalContactName,
    },
  });
  if (!updated) return NextResponse.json({ ok: false, error: "contact update failed" }, { status: 500 });

  logActivity({
    agencyId: session.agencyId,
    clientId,
    actorUserId: session.userId,
    actorEmail: session.email,
    category: "tenant",
    action: `client.contact.${action}`,
    message,
  });
  return NextResponse.json({ ok: true, contacts, entityType });
}

function clean(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}
