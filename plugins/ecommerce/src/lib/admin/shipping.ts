// Admin-side shipping zones + rates.
// Lifted from `02 felicias aqua portal work/src/lib/admin/shipping.ts`.
// Pure types + selectors; persistence sits in `server/shippingStore.ts`.

export interface ShippingZone {
  id: string;
  name: string;
  countries: string[];           // ISO-3166 alpha-2 codes
  default?: boolean;
}

export interface ShippingRate {
  id: string;
  zoneId: string;
  name: string;                  // "Standard", "Express"
  description?: string;
  // Either fixed price or per-weight band.
  type: "fixed" | "weight" | "free";
  amount?: number;               // pence (when type = "fixed")
  freeShippingMin?: number;      // pence; when subtotal exceeds, free
  weightBands?: { upToGrams: number; amount: number }[];
  estDeliveryDays?: { min: number; max: number };
  active: boolean;
  createdAt: number;
}

export function pickRateForZone(rates: ShippingRate[], zoneId: string): ShippingRate[] {
  return rates.filter(r => r.zoneId === zoneId && r.active);
}

export function calculateShipping(args: {
  rates: ShippingRate[];
  zoneId: string;
  cartSubtotal: number;          // pence
  weightGrams: number;
}): { rateId: string; amount: number } | null {
  const candidates = pickRateForZone(args.rates, args.zoneId);
  if (candidates.length === 0) return null;
  const cheapest = candidates
    .map(rate => {
      if (rate.type === "free") return { rateId: rate.id, amount: 0 };
      if (rate.freeShippingMin && args.cartSubtotal >= rate.freeShippingMin) {
        return { rateId: rate.id, amount: 0 };
      }
      if (rate.type === "fixed") return { rateId: rate.id, amount: rate.amount ?? 0 };
      if (rate.type === "weight") {
        const band = rate.weightBands?.find(b => args.weightGrams <= b.upToGrams);
        return { rateId: rate.id, amount: band?.amount ?? 0 };
      }
      return { rateId: rate.id, amount: 0 };
    })
    .sort((a, b) => a.amount - b.amount);
  return cheapest[0] ?? null;
}
