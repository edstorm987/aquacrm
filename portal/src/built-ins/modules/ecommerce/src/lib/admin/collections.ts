// Admin-side collections — group products into themed sets shown by the
// storefront grids.
//
// Lifted from `02 felicias aqua portal work/src/lib/admin/collections.ts`.

export interface ProductCollection {
  id: string;
  slug: string;
  name: string;
  description?: string;
  image?: string;
  productSlugs: string[];        // ordered membership
  hidden?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CollectionListFilter {
  q?: string;
  includeHidden?: boolean;
}

export function filterCollections(
  collections: ProductCollection[],
  filter: CollectionListFilter,
): ProductCollection[] {
  let out = collections;
  if (!filter.includeHidden) out = out.filter(c => !c.hidden);
  if (filter.q) {
    const q = filter.q.toLowerCase();
    out = out.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.slug.toLowerCase().includes(q) ||
      (c.description ?? "").toLowerCase().includes(q),
    );
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}
