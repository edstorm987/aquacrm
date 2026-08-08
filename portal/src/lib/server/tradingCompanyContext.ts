import "server-only";

export async function getActiveTradingCompanyId(agencyId: string): Promise<string | null> {
  // AquaOasis-Web has one internal operating workspace. Trading names are
  // record-level service and client-facing brand attribution, never hidden
  // workspace contexts. Ignore legacy context cookies so no data disappears.
  void agencyId;
  return null;
}
