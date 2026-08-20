# `src/built-ins/modules/ecommerce/src/server/productsStore.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Per-client product catalog — CRUD over the per-install storage slice.  The 02 implementation kept a hardcoded PRODUCTS array + localStorage overrides. In 04 each client's catalog lives entirely in the install storage namespace under keys:  products/<slug>     — the canonical Product row override/<slug>     — partial override (promo flips) inventory/<sku>     — InventoryItemSnapshot  Reads merge override + inventory into the returned Product.

## Exports (2)

- `interface ProductListOptions (2 members)`
- `class ProductService`
    - `constructor(private storage: StoragePort)`
    - `async getProduct(slug: string): Promise<Product | null>`
    - `async listProducts(options: ProductListOptions = {}): Promise<Product[]>`
    - `async upsertProduct(product: Product): Promise<Product>`
    - `async deleteProduct(slug: string): Promise<boolean>`
    - `async setOverride(slug: string, override: ProductOverride): Promise<void>`
    - `async clearOverride(slug: string): Promise<void>`
    - `async setInventory(item: InventoryItemSnapshot): Promise<void>`
    - `async getInventory(sku: string): Promise<InventoryItemSnapshot | null>`
    - `async listInventory(): Promise<InventoryItemSnapshot[]>`
    - `async reserveStock(sku: string, quantity: number): Promise<{ ok: true } | { ok: false; error: string }>`
    - `async releaseReserved(sku: string, quantity: number): Promise<void>`
    - `async commitSale(sku: string, quantity: number): Promise<void>`

## Depends on (3)

- [`src/built-ins/modules/ecommerce/src/lib/products.ts`](../lib/products.md)
- [`src/built-ins/modules/ecommerce/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/ecommerce/src/server/ports.ts`](./ports.md)

## Used by (1)

- [`src/built-ins/modules/ecommerce/src/server/index.ts`](./index.md)

