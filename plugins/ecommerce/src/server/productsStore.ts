// Per-client product catalog — CRUD over the per-install storage slice.
//
// The 02 implementation kept a hardcoded PRODUCTS array + localStorage
// overrides. In 04 each client's catalog lives entirely in the install
// storage namespace under keys:
//
//   products/<slug>     — the canonical Product row
//   override/<slug>     — partial override (promo flips)
//   inventory/<sku>     — InventoryItemSnapshot
//
// Reads merge override + inventory into the returned Product.

import { now } from "../lib/time";
import { applyOverride, computeAvailable } from "../lib/products";
import type {
  InventoryItemSnapshot,
  Product,
  ProductOverride,
} from "../lib/products";
import type { StoragePort } from "./ports";

const PRODUCT_KEY_PREFIX = "products/";
const OVERRIDE_KEY_PREFIX = "override/";
const INVENTORY_KEY_PREFIX = "inventory/";

export interface ProductListOptions {
  includeHidden?: boolean;
  includeArchived?: boolean;
}

export class ProductService {
  constructor(private storage: StoragePort) {}

  private productKey(slug: string): string { return `${PRODUCT_KEY_PREFIX}${slug}`; }
  private overrideKey(slug: string): string { return `${OVERRIDE_KEY_PREFIX}${slug}`; }
  private inventoryKey(sku: string): string { return `${INVENTORY_KEY_PREFIX}${sku}`; }

  // ─── Reads ──────────────────────────────────────────────────────────

  async getProduct(slug: string): Promise<Product | null> {
    const base = await this.storage.get<Product>(this.productKey(slug));
    if (!base) return null;
    const override = await this.storage.get<ProductOverride>(this.overrideKey(slug));
    const inv = await this.loadInventoryMap();
    return computeAvailable(applyOverride(base, override), inv);
  }

  async listProducts(options: ProductListOptions = {}): Promise<Product[]> {
    const keys = await this.storage.list(PRODUCT_KEY_PREFIX);
    const base = await Promise.all(keys.map(k => this.storage.get<Product>(k)));
    const inv = await this.loadInventoryMap();
    const overrides = await this.loadOverrideMap();
    const merged = base
      .filter((p): p is Product => p !== undefined)
      .map(p => computeAvailable(applyOverride(p, overrides[p.slug]), inv));
    return merged.filter(p => {
      if (!options.includeHidden && p.hidden) return false;
      if (!options.includeArchived && p.archived) return false;
      return true;
    });
  }

  private async loadInventoryMap(): Promise<Record<string, InventoryItemSnapshot>> {
    const keys = await this.storage.list(INVENTORY_KEY_PREFIX);
    const items = await Promise.all(keys.map(k => this.storage.get<InventoryItemSnapshot>(k)));
    const out: Record<string, InventoryItemSnapshot> = {};
    for (const item of items) {
      if (item) out[item.sku] = item;
    }
    return out;
  }

  private async loadOverrideMap(): Promise<Record<string, ProductOverride>> {
    const keys = await this.storage.list(OVERRIDE_KEY_PREFIX);
    const items = await Promise.all(keys.map(k => this.storage.get<ProductOverride>(k)));
    const out: Record<string, ProductOverride> = {};
    for (const item of items) {
      if (item) out[item.slug] = item;
    }
    return out;
  }

  // ─── Writes ─────────────────────────────────────────────────────────

  async upsertProduct(product: Product): Promise<Product> {
    const next: Product = {
      ...product,
      createdAt: product.createdAt ?? now(),
      updatedAt: now(),
    };
    await this.storage.set(this.productKey(product.slug), next);
    return next;
  }

  async deleteProduct(slug: string): Promise<boolean> {
    const existing = await this.storage.get<Product>(this.productKey(slug));
    if (!existing) return false;
    await this.storage.del(this.productKey(slug));
    await this.storage.del(this.overrideKey(slug));
    return true;
  }

  // ─── Overrides ──────────────────────────────────────────────────────

  async setOverride(slug: string, override: ProductOverride): Promise<void> {
    await this.storage.set(this.overrideKey(slug), override);
  }

  async clearOverride(slug: string): Promise<void> {
    await this.storage.del(this.overrideKey(slug));
  }

  // ─── Inventory ──────────────────────────────────────────────────────

  async setInventory(item: InventoryItemSnapshot): Promise<void> {
    await this.storage.set(this.inventoryKey(item.sku), item);
  }

  async getInventory(sku: string): Promise<InventoryItemSnapshot | null> {
    const stored = await this.storage.get<InventoryItemSnapshot>(this.inventoryKey(sku));
    return stored ?? null;
  }

  async listInventory(): Promise<InventoryItemSnapshot[]> {
    const keys = await this.storage.list(INVENTORY_KEY_PREFIX);
    const items = await Promise.all(keys.map(k => this.storage.get<InventoryItemSnapshot>(k)));
    return items.filter((i): i is InventoryItemSnapshot => i !== undefined);
  }

  // Reserve stock for a pending sale; rollback via `releaseReserved`.
  async reserveStock(sku: string, quantity: number): Promise<{ ok: true } | { ok: false; error: string }> {
    const item = await this.getInventory(sku);
    if (!item) return { ok: false, error: `Unknown SKU: ${sku}` };
    if (item.unlimited) return { ok: true };
    const available = item.onHand - item.reserved;
    if (available < quantity) return { ok: false, error: `Out of stock for ${sku}` };
    await this.setInventory({ ...item, reserved: item.reserved + quantity });
    return { ok: true };
  }

  async releaseReserved(sku: string, quantity: number): Promise<void> {
    const item = await this.getInventory(sku);
    if (!item || item.unlimited) return;
    await this.setInventory({
      ...item,
      reserved: Math.max(0, item.reserved - quantity),
    });
  }

  async commitSale(sku: string, quantity: number): Promise<void> {
    const item = await this.getInventory(sku);
    if (!item || item.unlimited) return;
    await this.setInventory({
      ...item,
      onHand: Math.max(0, item.onHand - quantity),
      reserved: Math.max(0, item.reserved - quantity),
    });
  }
}
