/**
 * The slice of a foundation `Client` these matchers read. Declared structurally
 * so the plugin doesn't have to import the foundation's `Client` type: the real
 * record is assignable, and so is whatever the `TenantPort` hands back.
 */
export interface ClientIdentityRef {
  id: string;
  personId?: string;
}

export interface LeadClientIdentityRef {
  clientId?: string;
  convertedClientId?: string;
  personId?: string;
}

export interface ContactClientIdentityRef {
  clientId?: string;
  personId?: string;
}

function samePerson(left?: string, right?: string): boolean {
  return Boolean(left && right && left === right);
}

/**
 * A client association is an authorization-sensitive identity edge. Only
 * reciprocal typed client ids or the canonical Person id may establish it;
 * email and free-form client metadata are descriptive data, never proof.
 */
export function clientMatchesLead(client: ClientIdentityRef, lead: LeadClientIdentityRef): boolean {
  return lead.clientId === client.id
    || lead.convertedClientId === client.id
    || samePerson(client.personId, lead.personId);
}

export function clientMatchesContact(client: ClientIdentityRef, contact: ContactClientIdentityRef): boolean {
  return contact.clientId === client.id || samePerson(client.personId, contact.personId);
}
