import type { Currency } from "./domain";

export const SUPPORTED_CURRENCIES: Array<{ code: Currency; label: string }> = [
  { code: "gbp", label: "GBP - British pound" },
  { code: "eur", label: "EUR - Euro" },
  { code: "usd", label: "USD - US dollar" },
  { code: "cad", label: "CAD - Canadian dollar" },
  { code: "aud", label: "AUD - Australian dollar" },
  { code: "nzd", label: "NZD - New Zealand dollar" },
  { code: "chf", label: "CHF - Swiss franc" },
  { code: "sek", label: "SEK - Swedish krona" },
  { code: "nok", label: "NOK - Norwegian krone" },
  { code: "dkk", label: "DKK - Danish krone" },
  { code: "jpy", label: "JPY - Japanese yen" },
  { code: "sgd", label: "SGD - Singapore dollar" },
  { code: "hkd", label: "HKD - Hong Kong dollar" },
  { code: "aed", label: "AED - UAE dirham" },
];

export function normaliseCurrency(value: unknown, fallback: Currency = "gbp"): Currency {
  const code = typeof value === "string" ? value.trim().toLowerCase() : "";
  return SUPPORTED_CURRENCIES.some(currency => currency.code === code) ? code as Currency : fallback;
}

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}
