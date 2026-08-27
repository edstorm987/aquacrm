export type BattleNavigationState<Section extends string> = {
  section: Section;
  scopeId: string;
  requestedSection: Section;
  requestedScopeId: string;
};

function validScope(requestedScopeId: string, availableScopeIds: readonly string[]): string {
  return availableScopeIds.includes(requestedScopeId)
    ? requestedScopeId
    : availableScopeIds[0] ?? requestedScopeId;
}

export function createBattleNavigationState<Section extends string>(
  requestedSection: Section,
  requestedScopeId: string,
  availableScopeIds: readonly string[],
): BattleNavigationState<Section> {
  return {
    section: requestedSection,
    scopeId: validScope(requestedScopeId, availableScopeIds),
    requestedSection,
    requestedScopeId,
  };
}

/**
 * Reconcile a reused Battle client subtree with a new same-page RSC request.
 * Local section/scope choices survive unrelated payload refreshes. When either
 * URL-controlled value changes, both controls move to the URL pair together;
 * the separately retained plan/profile drafts are deliberately untouched.
 */
export function reconcileBattleNavigationState<Section extends string>(
  current: BattleNavigationState<Section>,
  requestedSection: Section,
  requestedScopeId: string,
  availableScopeIds: readonly string[],
): BattleNavigationState<Section> {
  const requestChanged = current.requestedSection !== requestedSection
    || current.requestedScopeId !== requestedScopeId;
  if (requestChanged) {
    return createBattleNavigationState(requestedSection, requestedScopeId, availableScopeIds);
  }
  if (!availableScopeIds.includes(current.scopeId)) {
    return {
      ...current,
      scopeId: validScope(requestedScopeId, availableScopeIds),
    };
  }
  return current;
}
