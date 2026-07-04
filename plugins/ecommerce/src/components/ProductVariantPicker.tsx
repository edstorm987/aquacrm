"use client";

import { useState } from "react";

import type { Product, ProductOption } from "../lib/products";
import {
  defaultSelection,
  isCustomValueId,
  makeCustomValueId,
  resolveVariant,
  type ResolvedVariant,
} from "../lib/variants";

export interface ProductVariantPickerProps {
  product: Product;
  onChange?: (resolved: ResolvedVariant) => void;
}

export function ProductVariantPicker({ product, onChange }: ProductVariantPickerProps) {
  const [selection, setSelection] = useState<Record<string, string>>(
    () => defaultSelection(product.options ?? []),
  );
  const [customHex, setCustomHex] = useState<string>("");

  const resolved = resolveVariant(product, { selection, customHex });

  function pick(opt: ProductOption, valueId: string): void {
    const next = { ...selection, [opt.id]: valueId };
    setSelection(next);
    onChange?.(resolveVariant(product, { selection: next, customHex }));
  }

  function pickCustomColor(opt: ProductOption, hex: string): void {
    setCustomHex(hex);
    const next = { ...selection, [opt.id]: makeCustomValueId(hex) };
    setSelection(next);
    onChange?.(resolveVariant(product, { selection: next, customHex: hex }));
  }

  if (!product.options || product.options.length === 0) return null;

  return (
    <div className="ecom-variant-picker">
      {product.options.map(opt => (
        <fieldset key={opt.id} className={`ecom-option ecom-option-${opt.displayType}`}>
          <legend>{opt.name}</legend>
          <ul>
            {opt.values.map(val => {
              const selected = selection[opt.id] === val.id;
              return (
                <li key={val.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => pick(opt, val.id)}
                    style={val.hexColor ? { background: val.hexColor } : undefined}
                    title={val.label}
                  >
                    {opt.displayType === "swatch" || opt.displayType === "color-wheel" ? "" : val.label}
                  </button>
                </li>
              );
            })}
            {opt.allowCustom && opt.displayType === "color-wheel" && (
              <li>
                <input
                  type="color"
                  value={customHex || "#cccccc"}
                  onChange={(e) => pickCustomColor(opt, e.target.value)}
                  aria-label="Custom colour"
                />
                {(() => {
                  const sel = selection[opt.id];
                  return sel && isCustomValueId(sel) ? <span>Custom {customHex}</span> : null;
                })()}
              </li>
            )}
          </ul>
        </fieldset>
      ))}

      <p className="ecom-variant-summary">
        {resolved.description} — £{(resolved.price / 100).toFixed(2)}
        {typeof resolved.available === "number" && resolved.available <= 3 && (
          <span> · only {resolved.available} left</span>
        )}
      </p>
    </div>
  );
}
