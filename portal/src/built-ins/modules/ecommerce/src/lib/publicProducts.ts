import type {
  Product,
  ProductFormat,
  ProductOption,
  ProductOptionValue,
  ProductReview,
  ProductVariant,
} from "./products";

/**
 * The product fields a published, anonymous storefront is allowed to read.
 *
 * Keep this as an explicit DTO instead of `Omit<Product, ...>`: adding a new
 * storage/admin/delivery field to Product must not silently make it public.
 */
export interface PublicProduct {
  slug: string;
  id: string;
  range?: string;
  name: string;
  tagline?: string;
  price: number;
  salePrice?: number;
  onSale?: boolean;
  image?: string;
  badge?: string;
  badgeColor?: string;
  showLowStock?: boolean;
  available?: number;
  rating?: number;
  reviewCount?: number;
  origin?: string;
  shortBullets?: string[];
  description?: string[];
  note?: string;
  formats?: ProductFormat[];
  sizes?: Array<{ label: string; price: number }>;
  formatSizes?: Partial<Record<ProductFormat, Array<{ label: string; price: number }>>>;
  formatContent?: Partial<Record<ProductFormat, {
    tagline?: string;
    description?: string[];
    shortBullets?: string[];
    note?: string;
    ingredients?: Array<{ name: string; note?: string }>;
    directions?: string;
  }>>;
  fragrances?: string[];
  fragranceContent?: Record<string, {
    note?: string;
    description?: string[];
    shortBullets?: string[];
  }>;
  ingredients?: Array<{ name: string; note?: string }>;
  directions?: string;
  benefits?: Array<{ icon: string; title: string; body: string }>;
  reviews?: Array<{
    name: string;
    location: string;
    stars: number;
    title: string;
    body: string;
  }>;
  options?: Array<{
    id: string;
    name: string;
    displayType: ProductOption["displayType"];
    values: Array<{
      id: string;
      label: string;
      hexColor?: string;
      image?: string;
      priceModifier?: number;
      available?: boolean;
    }>;
    required?: boolean;
    allowCustom?: boolean;
  }>;
  variants?: Array<{
    id: string;
    optionValues: Record<string, string>;
    price: number;
    salePrice?: number;
    image?: string;
    available?: number;
    isCustom?: boolean;
  }>;
  customColorSurcharge?: number;
  digital?: boolean;
  currency?: string;
  taxBehavior?: "inclusive" | "exclusive";
}

const PUBLIC_FORMATS: readonly ProductFormat[] = [
  "bar",
  "jar",
  "dispenser",
  "sachet",
  "stone",
  "card",
  "physical",
  "digital",
];

function publicIngredients(
  ingredients: Array<{ name: string; note?: string }> | undefined,
): Array<{ name: string; note?: string }> | undefined {
  return ingredients?.map(ingredient => ({
    name: ingredient.name,
    note: ingredient.note,
  }));
}

function publicReview(review: ProductReview): NonNullable<PublicProduct["reviews"]>[number] {
  return {
    name: review.name,
    location: review.location,
    stars: review.stars,
    title: review.title,
    body: review.body,
  };
}

function publicOptionValue(
  value: ProductOptionValue,
): NonNullable<PublicProduct["options"]>[number]["values"][number] {
  return {
    id: value.id,
    label: value.label,
    hexColor: value.hexColor,
    image: value.image,
    priceModifier: value.priceModifier,
    available: value.available,
  };
}

function publicOption(option: ProductOption): NonNullable<PublicProduct["options"]>[number] {
  return {
    id: option.id,
    name: option.name,
    displayType: option.displayType,
    values: option.values.map(publicOptionValue),
    required: option.required,
    allowCustom: option.allowCustom,
  };
}

function publicVariant(variant: ProductVariant): NonNullable<PublicProduct["variants"]>[number] {
  return {
    id: variant.id,
    optionValues: Object.fromEntries(
      Object.entries(variant.optionValues).filter(([, value]) => typeof value === "string"),
    ),
    price: variant.price,
    salePrice: variant.salePrice,
    image: variant.image,
    available: variant.available,
    isCustom: variant.isCustom,
  };
}

function publicFormatSizes(
  value: Product["formatSizes"],
): PublicProduct["formatSizes"] {
  if (!value) return undefined;
  return Object.fromEntries(PUBLIC_FORMATS.flatMap(format => {
    const sizes = value[format];
    return sizes
      ? [[format, sizes.map(size => ({ label: size.label, price: size.price }))] as const]
      : [];
  })) as PublicProduct["formatSizes"];
}

function publicFormatContent(
  value: Product["formatContent"],
): PublicProduct["formatContent"] {
  if (!value) return undefined;
  return Object.fromEntries(PUBLIC_FORMATS.flatMap(format => {
    const content = value[format];
    return content
      ? [[format, {
          tagline: content.tagline,
          description: content.description ? [...content.description] : undefined,
          shortBullets: content.shortBullets ? [...content.shortBullets] : undefined,
          note: content.note,
          ingredients: publicIngredients(content.ingredients),
          directions: content.directions,
        }] as const]
      : [];
  })) as PublicProduct["formatContent"];
}

function publicFragranceContent(
  value: Product["fragranceContent"],
): PublicProduct["fragranceContent"] {
  if (!value) return undefined;
  return Object.fromEntries(Object.entries(value).map(([fragrance, content]) => [
    fragrance,
    {
      note: content.note,
      description: content.description ? [...content.description] : undefined,
      shortBullets: content.shortBullets ? [...content.shortBullets] : undefined,
    },
  ]));
}

/** Convert a private storage Product into the published storefront contract. */
export function toPublicProduct(product: Product): PublicProduct {
  return {
    slug: product.slug,
    id: product.id,
    range: product.range,
    name: product.name,
    tagline: product.tagline,
    price: product.price,
    salePrice: product.salePrice,
    onSale: product.onSale,
    image: product.image,
    badge: product.badge,
    badgeColor: product.badgeColor,
    showLowStock: product.showLowStock,
    available: product.available,
    rating: product.rating,
    reviewCount: product.reviewCount,
    origin: product.origin,
    shortBullets: product.shortBullets ? [...product.shortBullets] : undefined,
    description: product.description ? [...product.description] : undefined,
    note: product.note,
    formats: product.formats?.filter(format => PUBLIC_FORMATS.includes(format)),
    sizes: product.sizes?.map(size => ({ label: size.label, price: size.price })),
    formatSizes: publicFormatSizes(product.formatSizes),
    formatContent: publicFormatContent(product.formatContent),
    fragrances: product.fragrances ? [...product.fragrances] : undefined,
    fragranceContent: publicFragranceContent(product.fragranceContent),
    ingredients: publicIngredients(product.ingredients),
    directions: product.directions,
    benefits: product.benefits?.map(benefit => ({
      icon: benefit.icon,
      title: benefit.title,
      body: benefit.body,
    })),
    reviews: product.reviews?.map(publicReview),
    options: product.options?.map(publicOption),
    variants: product.variants?.map(publicVariant),
    customColorSurcharge: product.customColorSurcharge,
    digital: product.digital,
    currency: product.currency,
    taxBehavior: product.taxBehavior,
  };
}
