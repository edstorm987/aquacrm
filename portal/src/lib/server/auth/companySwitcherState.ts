import "server-only";

import { getActiveAgencyId, getSessionAgencyIds } from "./auth";
import { getAgency } from "@/server/tenants";
import type { ServerUser, SessionPayload } from "@/server/types";

export interface CompanySwitchOption {
  id: string;
  name: string;
  slug: string;
  swatch?: string;
}

export interface CompanySwitcherState {
  activeAgencyId: string;
  canSwitch: boolean;
  agencies: CompanySwitchOption[];
}

// A session standing in for somebody else, or fenced to a sandbox tenant,
// must remain pinned to that tenant. Both the API and the server-rendered
// switcher state use this one predicate so their answers cannot drift.
export function isBorrowedCompanyIdentity(session: SessionPayload): boolean {
  return Boolean(
    session.isDemo ||
    session.publicShowcase ||
    session.devReturnAgencyId ||
    session.previewReturnAgencyId ||
    session.showcaseReturnAgencyId,
  );
}

export function liveCompanyAgencyIds(user: Pick<ServerUser, "agencyIds" | "agencyId">): string[] {
  return user.agencyIds && user.agencyIds.length > 0 ? user.agencyIds : [user.agencyId];
}

/** Membership can only narrow: signed session intersection live user. */
export function switchableCompanyAgencyIds(session: SessionPayload, userAgencyIds: string[]): string[] {
  const live = new Set(userAgencyIds);
  return getSessionAgencyIds(session).filter(id => live.has(id));
}

export function buildCompanySwitcherState(session: SessionPayload, user: ServerUser): CompanySwitcherState {
  const agencies: CompanySwitchOption[] = [];
  for (const id of switchableCompanyAgencyIds(session, liveCompanyAgencyIds(user))) {
    const agency = getAgency(id);
    if (!agency || agency.status !== "active") continue;
    agencies.push({
      id: agency.id,
      name: agency.name,
      slug: agency.slug,
      swatch: agency.brand?.primaryColor,
    });
  }

  return {
    activeAgencyId: getActiveAgencyId(session),
    canSwitch: !isBorrowedCompanyIdentity(session),
    agencies,
  };
}
