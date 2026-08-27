import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import type { Product, ProductOption } from "../src/built-ins/modules/ecommerce/src/lib/products";
import { mergeOptionValueLabels } from "../src/built-ins/modules/ecommerce/src/lib/productAuthoring";
import { buildEcommerceContainer, ProductConflictError } from "../src/built-ins/modules/ecommerce/src/server/index";
import type { StoragePort } from "../src/built-ins/modules/ecommerce/src/server/ports";

class FaultStorage implements StoragePort {
  readonly data = new Map<string, unknown>();
  failNextSetPrefix: string | null = null;
  private readonly tails = new Map<string, Promise<void>>();

  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.data.get(key)) as T | undefined;
  }
  async set<T>(key: string, value: T): Promise<void> {
    if (this.failNextSetPrefix && key.startsWith(this.failNextSetPrefix)) {
      this.failNextSetPrefix = null;
      throw new Error(`forced product lifecycle failure: ${key}`);
    }
    this.data.set(key, structuredClone(value));
  }
  async del(key: string): Promise<void> { this.data.delete(key); }
  async list(prefix = ""): Promise<string[]> { return [...this.data.keys()].filter(key => key.startsWith(prefix)); }
  async runExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const tail = previous.then(() => gate);
    this.tails.set(key, tail);
    await previous;
    try { return await operation(); }
    finally {
      release();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }
}

function world(storage = new FaultStorage()) {
  return {
    storage,
    services: buildEcommerceContainer({
      storage,
      activity: { logActivity: input => ({ id: "activity", ts: Date.now(), ...input }), listActivity: () => [] },
      events: { emit() {} },
      tenant: { getClient: () => null, getClientForAgency: () => null },
      pluginInstalls: { getInstall: () => null },
    }),
  };
}

function baseProduct(): Product {
  return {
    id: "product-stable-id",
    slug: "original-product",
    name: "Original product",
    price: 1_000,
    currency: "gbp",
    stockSku: "SKU-PRODUCT",
    options: [{
      id: "colour",
      name: "Colour",
      displayType: "swatch",
      values: [{ id: "red", label: "Red", hexColor: "#ff0000", priceModifier: 250, available: false }],
    }],
    variants: [{ id: "red-small", optionValues: { colour: "red" }, price: 1_000, sku: "SKU-RED" }],
  };
}

test("details and variants use compare-and-swap commands instead of reverting each other", async () => {
  const { services } = world();
  const initial = await services.products.upsertProduct(baseProduct());
  assert.equal(initial.version, 1);
  const detailsSnapshot = structuredClone(initial);
  const variantsSnapshot = structuredClone(initial);

  const details = await services.products.saveProductDetails(
    { ...detailsSnapshot, price: 1_200 },
    detailsSnapshot.version,
  );
  assert.equal(details.price, 1_200);
  assert.equal(details.version, 2);
  await assert.rejects(
    services.products.saveProductVariants(
      variantsSnapshot.id,
      variantsSnapshot.version!,
      variantsSnapshot.options,
      [...(variantsSnapshot.variants ?? []), { id: "red-large", optionValues: { colour: "red" }, price: 1_300 }],
    ),
    ProductConflictError,
  );
  assert.equal((await services.products.getProductById(initial.id))?.price, 1_200);

  const reloaded = (await services.products.getProductById(initial.id))!;
  const variants = await services.products.saveProductVariants(
    reloaded.id,
    reloaded.version!,
    reloaded.options,
    [...(reloaded.variants ?? []), { id: "red-large", optionValues: { colour: "red" }, price: 1_300 }],
  );
  assert.equal(variants.price, 1_200);
  assert.equal(variants.variants?.length, 2);
  assert.equal(variants.version, 3);
});

test("new products receive a server-owned stable id", async () => {
  const { services } = world();
  const created = await services.products.createProduct({
    ...baseProduct(),
    id: "browser-authored-id",
    slug: "server-owned-product",
  });
  assert.match(created.id, /^product_/);
  assert.notEqual(created.id, "browser-authored-id");
  assert.equal(created.version, 1);
});

test("slug rename migrates collections, survives a partial write and keeps stable identity/inventory", async () => {
  const storage = new FaultStorage();
  const { services } = world(storage);
  const initial = await services.products.upsertProduct(baseProduct());
  await services.products.setInventory({ sku: "SKU-PRODUCT", onHand: 8, reserved: 3, lowAt: 2 });
  await storage.set("collections", [{
    id: "collection-one",
    slug: "collection-one",
    name: "Collection one",
    productSlugs: [initial.slug],
    createdAt: 1,
    updatedAt: 1,
  }]);
  storage.failNextSetPrefix = "collections";
  const renamedInput = { ...initial, slug: "renamed-product" };
  await assert.rejects(
    services.products.saveProductDetails(renamedInput, initial.version),
    /forced product lifecycle failure/,
  );
  const recovered = await services.products.saveProductDetails(renamedInput, initial.version);
  assert.equal(recovered.id, initial.id);
  assert.equal(recovered.slug, "renamed-product");
  assert.equal(await services.products.getProduct("original-product"), null);
  assert.equal((await services.products.getProduct("renamed-product"))?.id, initial.id);
  const collections = await storage.get<Array<{ productSlugs: string[] }>>("collections");
  assert.deepEqual(collections?.[0]?.productSlugs, ["renamed-product"]);
  assert.deepEqual(await services.products.getInventory("SKU-PRODUCT"), {
    sku: "SKU-PRODUCT", onHand: 8, reserved: 3, lowAt: 2,
  });
});

test("ordinary retirement archives in place and stale checkout cannot buy it", async () => {
  const { services } = world();
  const initial = await services.products.upsertProduct(baseProduct());
  await services.products.setInventory({ sku: "SKU-PRODUCT", onHand: 8, reserved: 0, lowAt: 2 });
  const archived = await services.products.archiveProduct(initial.slug, initial.version);
  assert.equal(archived?.archived, true);
  assert.equal(archived?.hidden, true);
  assert.equal((await services.products.getInventory("SKU-PRODUCT"))?.onHand, 8);
  await assert.rejects(
    services.checkout.prepare({
      version: 1,
      operationId: "checkout-archived-product",
      items: [{ productId: initial.id, quantity: 1 }],
    }, { agencyId: "agency", clientId: "client", defaultCurrency: "gbp" }),
    /unavailable/,
  );
});

test("mounted editors send scoped versioned commands and label retirement honestly", async () => {
  const [details, variants, list, service] = await Promise.all([
    readFile(join(process.cwd(), "src/built-ins/modules/ecommerce/src/components/admin/ProductEditor.tsx"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/modules/ecommerce/src/components/admin/VariantsEditor.tsx"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/modules/ecommerce/src/components/admin/ProductsList.tsx"), "utf8"),
    readFile(join(process.cwd(), "src/built-ins/modules/ecommerce/src/server/productsStore.ts"), "utf8"),
  ]);
  assert.match(details, /command: "details"/);
  assert.match(details, /expectedVersion/);
  assert.match(variants, /command: "variants"/);
  assert.match(variants, /mergeOptionValueLabels\(o\.values/);
  assert.match(variants, /value\.hexColor/);
  assert.match(variants, /value\.priceModifier/);
  assert.match(variants, /value\.available/);
  assert.match(list, /busySlug === p\.slug \? "Archiving…" : "Archive"/);
  assert.match(list, /checkedJsonMutation/);
  assert.doesNotMatch(list, />Delete<\/button>/);
  assert.match(service, /product-rename-operation/);
});

test("lossless option-label editing retains rich value metadata", () => {
  const rich: ProductOption["values"] = [{
    id: "red",
    label: "Red",
    hexColor: "#ff0000",
    priceModifier: 250,
    available: false,
    image: "https://assets.example.test/red.png",
  }];
  assert.deepEqual(mergeOptionValueLabels(rich, "Crimson"), [{
    id: "red",
    label: "Crimson",
    hexColor: "#ff0000",
    priceModifier: 250,
    available: false,
    image: "https://assets.example.test/red.png",
  }]);
});
