import type { ProductOption } from "./products";

export function mergeOptionValueLabels(
  existing: ProductOption["values"],
  csv: string,
): ProductOption["values"] {
  const labels = csv.split(",").map(label => label.trim()).filter(Boolean);
  return labels.map((label, index) => {
    const current = existing[index];
    if (current) return { ...current, label };
    const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `value-${index + 1}`;
    let id = base;
    let suffix = 2;
    const used = new Set(existing.map(value => value.id));
    while (used.has(id)) id = `${base}-${suffix++}`;
    return { id, label };
  });
}
