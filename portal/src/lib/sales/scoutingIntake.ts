export const SCOUTING_INTAKE_PAGE_SIZE = 12;

export interface SearchableScoutingProspect {
  id: string;
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  niche?: string;
  source: string;
  foundAt?: string;
  tags: string[];
}

export interface ScoutingIntakePage<T> {
  items: T[];
  matchingCount: number;
  page: number;
  pageCount: number;
  from: number;
  to: number;
}

/**
 * Keep a large import operable without mounting every row at once. Search spans
 * the fields an operator can recognise from CSV, Maps, or manual capture, and
 * the requested page is clamped when filtering or a concurrent update shrinks
 * the result set.
 */
export function paginateScoutingIntake<T extends SearchableScoutingProspect>(
  prospects: readonly T[],
  query: string,
  requestedPage: number,
  requestedPageSize = SCOUTING_INTAKE_PAGE_SIZE,
): ScoutingIntakePage<T> {
  const needle = query.trim().toLocaleLowerCase("en-GB");
  const matching = needle
    ? prospects.filter(prospect => scoutingProspectSearchText(prospect).includes(needle))
    : [...prospects];
  const pageSize = Number.isFinite(requestedPageSize) && requestedPageSize > 0
    ? Math.floor(requestedPageSize)
    : SCOUTING_INTAKE_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
  const page = Math.min(Math.max(0, Math.floor(requestedPage) || 0), pageCount - 1);
  const offset = page * pageSize;
  const items = matching.slice(offset, offset + pageSize);

  return {
    items,
    matchingCount: matching.length,
    page,
    pageCount,
    from: matching.length ? offset + 1 : 0,
    to: offset + items.length,
  };
}

function scoutingProspectSearchText(prospect: SearchableScoutingProspect): string {
  return [
    prospect.name,
    prospect.company,
    prospect.email,
    prospect.phone,
    prospect.website,
    prospect.address,
    prospect.niche,
    prospect.source,
    prospect.foundAt,
    ...prospect.tags,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("\n")
    .toLocaleLowerCase("en-GB");
}
