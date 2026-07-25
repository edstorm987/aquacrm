// Variant resolution helpers — pure functions, no I/O.
// Lifted verbatim from `02 felicias aqua portal work/src/lib/variants.ts`.

import type { Product, ProductOption, ProductOptionValue, ProductVariant } from "./products";

export interface SelectedVariantState {
  selection: Record<string, string>;       // optionId → valueId (or "custom:<hex>")
  customHex?: string;
}

export interface ResolvedVariant {
  variant: ProductVariant | null;
  price: number;
  salePrice?: number;
  available?: number;
  image?: string;
  isCustom: boolean;
  customHex?: string;
  description: string;
}

const CUSTOM_PREFIX = "custom:";

export function isCustomValueId(valueId: string): boolean {
  return valueId.startsWith(CUSTOM_PREFIX);
}

export function customHexFromValueId(valueId: string): string | undefined {
  return valueId.startsWith(CUSTOM_PREFIX) ? valueId.slice(CUSTOM_PREFIX.length) : undefined;
}

export function makeCustomValueId(hex: string): string {
  return `${CUSTOM_PREFIX}${hex.toLowerCase()}`;
}

export function defaultSelection(options: ProductOption[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const opt of options) {
    const firstAvailable = opt.values.find(v => v.available !== false) ?? opt.values[0];
    if (firstAvailable) out[opt.id] = firstAvailable.id;
  }
  return out;
}

export function findMatchingVariant(
  variants: ProductVariant[] | undefined,
  selection: Record<string, string>,
): ProductVariant | null {
  if (!variants || variants.length === 0) return null;
  for (const v of variants) {
    const keys = Object.keys(v.optionValues);
    if (keys.length !== Object.keys(selection).length) continue;
    let match = true;
    for (const k of keys) {
      if (v.optionValues[k] !== selection[k]) { match = false; break; }
    }
    if (match) return v;
  }
  return null;
}

export function resolveVariant(product: Product, state: SelectedVariantState): ResolvedVariant {
  const options = product.options ?? [];
  const variants = product.variants ?? [];
  const selection = state.selection;

  let customHex: string | undefined;
  for (const optId of Object.keys(selection)) {
    const valueId = selection[optId];
    if (valueId && isCustomValueId(valueId)) {
      customHex = customHexFromValueId(valueId);
      break;
    }
  }

  if (customHex) {
    const surcharge = product.customColorSurcharge ?? 0;
    const baseModifiers = sumModifiers(options, selection);
    const price = product.price + surcharge + baseModifiers;
    return {
      variant: {
        id: makeCustomValueId(customHex),
        optionValues: { ...selection },
        price,
        isCustom: true,
      },
      price,
      isCustom: true,
      customHex,
      description: describeSelection(options, selection, customHex),
    };
  }

  const exact = findMatchingVariant(variants, selection);
  if (exact) {
    return {
      variant: exact,
      price: exact.price,
      salePrice: exact.salePrice,
      image: exact.image,
      available: exact.available,
      isCustom: false,
      description: describeSelection(options, selection),
    };
  }

  const modifierSum = sumModifiers(options, selection);
  return {
    variant: null,
    price: product.price + modifierSum,
    salePrice: product.salePrice ? product.salePrice + modifierSum : undefined,
    isCustom: false,
    description: describeSelection(options, selection),
  };
}

function sumModifiers(options: ProductOption[], selection: Record<string, string>): number {
  let sum = 0;
  for (const opt of options) {
    const valueId = selection[opt.id];
    if (!valueId || isCustomValueId(valueId)) continue;
    const value = opt.values.find(v => v.id === valueId);
    if (value?.priceModifier) sum += value.priceModifier;
  }
  return sum;
}

function describeSelection(
  options: ProductOption[],
  selection: Record<string, string>,
  customHex?: string,
): string {
  const parts: string[] = [];
  for (const opt of options) {
    const valueId = selection[opt.id];
    if (!valueId) continue;
    if (isCustomValueId(valueId)) {
      parts.push(`Custom ${customHex ?? customHexFromValueId(valueId) ?? ""}`);
      continue;
    }
    const value = opt.values.find(v => v.id === valueId);
    if (value) parts.push(value.label);
  }
  return parts.join(" · ");
}

export function totalAvailable(product: Product): number | undefined {
  const variants = product.variants ?? [];
  if (variants.length === 0) return undefined;
  let known = false;
  let total = 0;
  for (const v of variants) {
    if (typeof v.available === "number") {
      known = true;
      total += Math.max(0, v.available);
    }
  }
  return known ? total : undefined;
}

export function findOptionValue(option: ProductOption, valueId: string): ProductOptionValue | undefined {
  return option.values.find(v => v.id === valueId);
}
