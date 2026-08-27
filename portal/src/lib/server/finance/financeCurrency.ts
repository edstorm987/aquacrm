import "server-only";

import { normaliseCurrency } from "@/built-ins/modules/agency-finance/src/lib/currencies";
import type { Currency } from "@/built-ins/modules/agency-finance/src/lib/domain";

export function resolveFinanceDefaultCurrency(_agencyId: string, configured: unknown): Currency {
  // This function runs in Server Components and GET handlers. Currency
  // resolution must therefore remain a pure read; a configured USD or EUR
  // value is user data, not something a page render may silently rewrite.
  return normaliseCurrency(configured, "gbp");
}
