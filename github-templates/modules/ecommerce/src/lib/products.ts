// Product types — lifted from `02 felicias aqua portal work/src/lib/products.ts`.
//
// What changed vs 02:
//   - Removed the hardcoded `PRODUCTS` seed array (Felicia-specific catalog).
//     Per-client product catalogs live in plugin storage; the
//     `ProductService` in `server/productsStore.ts` reads/writes them.
//   - Removed the localStorage `loadOverrides` / `loadCustomProducts` /
//     `loadInventory` helpers. Overrides + inventory are server-side
//     concerns now.
//   - Kept the type definitions verbatim — they describe the catalog
//     shape and downstream UI relies on them.

export interface ProductSize {
  label: string;
  price: number;
}

export type ProductFormat =
  | "bar"
  | "jar"
  | "dispenser"
  | "sachet"
  | "stone"
  | "card"
  | "physical"
  | "digital";

export interface ProductReview {
  name: string;
  location: string;
  stars: number;
  title: string;
  body: string;
}

export type ProductOptionDisplay =
  | "swatch"
  | "color-wheel"
  | "size"
  | "text"
  | "image";

export interface ProductOptionValue {
  id: string;
  label: string;
  hexColor?: string;             // required for swatch / color-wheel
  image?: string;                // required for image display
  priceModifier?: number;        // pence; positive or negative delta
  available?: boolean;           // default true
}

export interface ProductOption {
  id: string;                    // e.g. "colour", "size", "material"
  name: string;
  displayType: ProductOptionDisplay;
  values: ProductOptionValue[];
  required?: boolean;            // default true
  allowCustom?: boolean;         // colour-wheel only
}

export interface ProductVariant {
  id: string;
  optionValues: Record<string, string>;   // optionId → valueId
  price: number;                          // pence
  salePrice?: number;
  image?: string;
  sku?: string;
  available?: number;
  isCustom?: boolean;                     // ephemeral custom-colour variants
}

export interface Product {
  slug: string;
  id: string;
  range?: string;
  name: string;
  tagline?: string;
  price: number;                          // pence (base)
  salePrice?: number;
  onSale?: boolean;
  image?: string;
  badge?: string;
  badgeColor?: string;
  archived?: boolean;
  hidden?: boolean;
  stockSku?: string;                      // links to inventory item SKU
  showLowStock?: boolean;
  available?: number;                     // computed: onHand - reserved
  rating?: number;
  reviewCount?: number;
  origin?: string;
  shortBullets?: string[];
  description?: string[];
  note?: string;
  formats?: ProductFormat[];
  sizes?: ProductSize[];
  formatSizes?: Partial<Record<ProductFormat, ProductSize[]>>;
  formatContent?: Partial<Record<ProductFormat, {
    tagline?: string;
    description?: string[];
    shortBullets?: string[];
    note?: string;
    ingredients?: { name: string; note?: string }[];
    directions?: string;
  }>>;
  fragrances?: string[];
  fragranceContent?: Record<string, {
    note?: string;
    description?: string[];
    shortBullets?: string[];
  }>;
  ingredients?: { name: string; note?: string }[];
  directions?: string;
  benefits?: { icon: string; title: string; body: string }[];
  reviews?: ProductReview[];
  shopifyVariants?: {
    format: string;
    size: string;
    fragrance: string;
    id: string;
  }[];
  options?: ProductOption[];
  variants?: ProductVariant[];
  customColorSurcharge?: number;          // pence, when colour-wheel allows custom

  // Digital products carry a download url + license key after delivery.
  digital?: boolean;
  downloadUrl?: string;
  licenseKey?: string;

  // Per-product currency override (multi-currency feature).
  currency?: string;

  // Per-product tax behaviour. Defaults to inclusive when undefined.
  taxBehavior?: "inclusive" | "exclusive";

  createdAt?: number;
  updatedAt?: number;
}

// Storage-side override — lets the operator tweak a few fields on a
// product without rewriting the full row. Useful for promo flips.
export interface ProductOverride {
  slug: string;
  price?: number;
  salePrice?: number;
  onSale?: boolean;
  description?: string[];
  image?: string;
  badge?: string;
  badgeColor?: string;
  archived?: boolean;
  hidden?: boolean;
  stockSku?: string;
  showLowStock?: boolean;
}

// Compute available stock from inventory (server-side concern).
export interface InventoryItemSnapshot {
  sku: string;
  onHand: number;
  reserved: number;
  lowAt: number;
  unlimited?: boolean;
}

export function computeAvailable(
  product: Product,
  inv: Record<string, InventoryItemSnapshot>,
): Product {
  if (!product.stockSku) return product;
  const item = inv[product.stockSku];
  if (!item) return product;
  if (item.unlimited) return product;
  return { ...product, available: Math.max(0, item.onHand - item.reserved) };
}

export function applyOverride(p: Product, o: ProductOverride | undefined): Product {
  if (!o) return p;
  return {
    ...p,
    price: o.price ?? p.price,
    salePrice: o.salePrice ?? p.salePrice,
    onSale: o.onSale ?? p.onSale,
    description: o.description ?? p.description,
    image: o.image ?? p.image,
    badge: o.badge ?? p.badge,
    badgeColor: o.badgeColor ?? p.badgeColor,
    archived: o.archived ?? p.archived,
    hidden: o.hidden ?? p.hidden,
    stockSku: o.stockSku ?? p.stockSku,
    showLowStock: o.showLowStock ?? p.showLowStock,
  };
}
