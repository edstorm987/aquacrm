import "server-only";

import { normaliseCurrency } from "@/built-ins/modules/agency-finance/src/lib/currencies";
import type { Currency } from "@/built-ins/modules/agency-finance/src/lib/domain";
import { getInstall, patchInstall } from "@/server/pluginInstalls";

const MIGRATION_KEY = "ukDefaultCurrencyV1";

export function resolveFinanceDefaultCurrency(agencyId: string, configured: unknown): Currency {
  const install = getInstall({ agencyId }, "agency-finance");
  const current = normaliseCurrency(configured, "gbp");
  if (install && install.config[MIGRATION_KEY] !== true) {
    const migrated = current === "usd" ? "gbp" : current;
    patchInstall({ agencyId }, "agency-finance", {
      config: { defaultCurrency: migrated, [MIGRATION_KEY]: true },
    });
    return migrated;
  }
  return current;
}
