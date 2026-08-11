import type { CompensationPayment, CompensationProfile } from "./domain";

export interface CompensationCostProjection {
  monthlyBaseCents: number;
  monthlyEmployerCostCents: number;
  monthlyBonusTargetCents: number;
  monthlyTotalCents: number;
  annualTotalCents: number;
}

export function compensationCostProjection(profile: CompensationProfile): CompensationCostProjection {
  const monthlyBaseCents = profile.rateBasis === "annual"
    ? Math.round(profile.baseRateCents / 12)
    : profile.rateBasis === "monthly"
      ? profile.baseRateCents
      : profile.rateBasis === "hourly" || profile.rateBasis === "daily"
        ? Math.round(profile.baseRateCents * (profile.unitsPerWeek ?? 0) * 52 / 12)
        : 0;
  const monthlyEmployerCostCents = Math.round(monthlyBaseCents * profile.employerCostPercent / 100);
  const monthlyBonusTargetCents = Math.round(profile.annualBonusTargetCents / 12);
  const monthlyTotalCents = monthlyBaseCents + monthlyEmployerCostCents + monthlyBonusTargetCents;
  return {
    monthlyBaseCents,
    monthlyEmployerCostCents,
    monthlyBonusTargetCents,
    monthlyTotalCents,
    annualTotalCents: monthlyTotalCents * 12,
  };
}

export function compensationPaymentTotal(payment: CompensationPayment): number {
  return payment.grossCents + payment.employerCostCents;
}
