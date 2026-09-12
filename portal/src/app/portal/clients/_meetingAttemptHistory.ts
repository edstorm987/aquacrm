export function chronologicalMeetingAttempts<T extends { id: string; at: number }>(
  attempts: readonly T[] | undefined,
): T[] {
  return [...(attempts ?? [])]
    .sort((left, right) => left.at - right.at || left.id.localeCompare(right.id));
}
