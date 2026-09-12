/** Exact signed-metadata scope checks shared by public provider webhooks. */
export function exactProviderAgencyScope(
  metadata: Record<string, string> | undefined,
  agencyId: string,
): boolean {
  return Boolean(agencyId && metadata?.agencyId === agencyId);
}

export function exactProviderClientScope(
  metadata: Record<string, string> | undefined,
  agencyId: string,
  clientId: string | undefined,
): boolean {
  return Boolean(
    clientId
      && exactProviderAgencyScope(metadata, agencyId)
      && metadata?.clientId === clientId,
  );
}
