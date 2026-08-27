import "server-only";

import type {
  CanonicalCompensationTerms,
  CompensationTermsPort,
} from "@aqua/plugin-agency-finance/server";
import { getPeopleEmployee, updatePeopleEmployee } from "@/server/people";
import type { PeopleCommissionRule, PeopleEmployee } from "@/server/types";

const SUPPORTED_CURRENCIES = new Set<CanonicalCompensationTerms["currency"]>([
  "gbp", "eur", "usd", "cad", "aud", "nzd", "chf", "sek", "nok", "dkk", "jpy", "sgd", "hkd", "aed",
]);

function currency(value: string): CanonicalCompensationTerms["currency"] {
  const normalized = value.trim().toLowerCase() as CanonicalCompensationTerms["currency"];
  return SUPPORTED_CURRENCIES.has(normalized) ? normalized : "gbp";
}

function rateBasis(employee: PeopleEmployee): CanonicalCompensationTerms["rateBasis"] {
  if (employee.payBasis === "hourly") return "hourly";
  if (employee.payBasis === "day-rate") return "daily";
  if (employee.payBasis === "salary") return "annual";
  return "fixed";
}

function payeeType(employee: PeopleEmployee): CanonicalCompensationTerms["payeeType"] {
  if (employee.employmentType === "freelancer") return "freelancer";
  if (employee.employmentType === "contractor") return "contractor";
  return "employee";
}

function activeCommissionRules(employee: PeopleEmployee): PeopleCommissionRule[] {
  return employee.commissionRules.filter(rule => rule.status === "active");
}

function annualFixedBonusTarget(rules: PeopleCommissionRule[]): number {
  return rules.reduce((total, rule) => {
    if (rule.basis !== "fixed-bonus" || !rule.fixedAmountMinor) return total;
    if (rule.cadence === "monthly") return total + rule.fixedAmountMinor * 12;
    if (rule.cadence === "quarterly") return total + rule.fixedAmountMinor * 4;
    return total;
  }, 0);
}

export function peopleCompensationTerms(employee: PeopleEmployee): CanonicalCompensationTerms {
  const basis = rateBasis(employee);
  const rules = activeCommissionRules(employee);
  return {
    staffId: employee.id,
    compensationProfileId: employee.compensationProfileId,
    name: employee.name,
    email: employee.email,
    title: employee.title,
    departmentName: employee.department,
    payeeType: payeeType(employee),
    currency: currency(employee.currency),
    rateBasis: basis,
    baseRateCents: employee.payBasis === "commission-only" || employee.payBasis === "unpaid"
      ? 0
      : employee.basePayMinor ?? 0,
    unitsPerWeek: basis === "hourly" ? employee.weeklyHours : undefined,
    annualBonusTargetCents: annualFixedBonusTarget(rules),
    activeCommissionRuleCount: rules.length,
    hasVariableCommission: rules.some(rule => rule.ratePercent !== undefined || rule.cadence === "per-event"),
    contractStartsAt: employee.startDate,
    contractEndsAt: employee.endDate,
  };
}

export const agencyFinanceCompensationTermsPort: CompensationTermsPort = {
  getTerms(agencyId, staffId) {
    const employee = getPeopleEmployee(agencyId, staffId);
    return employee ? peopleCompensationTerms(employee) : null;
  },

  setProfileLink(agencyId, staffId, profileId, actor, expectedCurrentProfileId) {
    const employee = getPeopleEmployee(agencyId, staffId);
    if (!employee) throw new Error("Linked People employee not found.");
    if (profileId && employee.compensationProfileId && employee.compensationProfileId !== profileId) {
      throw new Error("This People employee is already linked to another compensation profile.");
    }
    if (!profileId && expectedCurrentProfileId && employee.compensationProfileId !== expectedCurrentProfileId) return;
    if ((employee.compensationProfileId ?? null) === profileId) return;
    const updated = updatePeopleEmployee(agencyId, staffId, { compensationProfileId: profileId ?? undefined }, actor);
    if (!updated) throw new Error("Linked People employee not found.");
  },
};
