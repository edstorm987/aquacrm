# `@aqua/plugin-ecommerce`

The per-client ecommerce subsystem for the Aqua portal. Lives at
`04-the-final-portal/plugins/ecommerce/`. Default-exports an
`AquaPlugin` manifest with `scopePolicy: "client"` (each client gets
their own store, products, orders).

> **Status**: 0.1.0 · beta · commerce category.
> **Owner**: T2 — Round 2.
> **Built for**: `04-the-final-portal/portal/` (foundation by T1) +
> `@aqua/plugin-website-editor` (T3, supplies block renderers by id).

## What this plugin owns

| Surface | Where | What |
|---------|-------|------|
| Products | `/portal/clients/[clientId]/ecommerce/products` (+ `/new`, `/[slug]`, `/[slug]/variants`) | CRUD + variant editor for a client's catalog |
| Collections | `/portal/clients/[clientId]/ecommerce/collections` | Group products into themed collections |
| Orders | `/portal/clients/[clientId]/ecommerce/orders` (+ `/[id]`, `/[id]/receipt`) | Stripe-backed order management |
| Customers | `/portal/clients/[clientId]/ecommerce/customers` (+ `/[email]`) | Per-client customer directory |
| Inventory | `/portal/clients/[clientId]/ecommerce/inventory` | Per-SKU stock tracking |
| Shipping | `/portal/clients/[clientId]/ecommerce/shipping` | Zone + rate management |
| Discounts | `/portal/clients/[clientId]/ecommerce/discounts` | Discount-code editor (the ecommerce slice of the legacy /admin/marketing page) |
| Cart UI | (storefront-only) | `CartContext` + `CartDrawer` + `ProductDetail` + variant picker rendered through T3 blocks |
| Stripe API | `/api/portal/ecommerce/stripe/*` | Webhook + checkout + billing-portal |

## Manifest contract

| Field | Value |
|-------|-------|
| `id` | `ecommerce` |
| `version` | `0.1.0` (beta) |
| `category` | `commerce` |
| `scopePolicy` | `client` |
| `requires` | `["website-editor"]` (block renderers live in T3) |
| `pages` | 14 lazy-loaded admin pages |
| `api` | products + orders + stripe routes |
| `storefront.blocks` | 8 ids contributed (`product-card`, `product-grid`, `cart-summary`, `checkout-summary`, `payment-button`, `order-success`, `variant-picker`, `product-search`) — **rendering owned by T3's plugin** |
| `setup` | one step: Stripe API key + webhook secret |
| `features` | 12 toggles (physicalProducts, digitalProducts, variants, inventory, shipping, discountCodes, reviews, subscriptions, stripeCheckout, downloadDelivery, licenseKeys, multiCurrency) |
| `onUninstall` | DOES NOT delete order rows — config preserved (architecture §7) |

## Folder layout

```
plugins/ecommerce/
├── package.json                 @aqua/plugin-ecommerce, peer next/react
├── tsconfig.json                strict, react-jsx, bundler resolution
├── README.md                    this file
├── index.ts                     default-exported AquaPlugin manifest
└── src/
    ├── lib/
    │   ├── aquaPluginTypes.ts   vendored mirror of T1's contract (TODO: replace with import)
    │   ├── tenancy.ts           Agency / Client / PluginInstall / Role aliases
    │   ├── ids.ts               crypto-strong id generator
    │   ├── time.ts              Date.now() indirection (testable)
    │   ├── products.ts          Product / ProductVariant / ProductOption types + selectors
    │   ├── cart.ts              cart line-item math + apply-discount
    │   ├── discounts.ts         discount code resolver
    │   ├── giftCards.ts         gift card balance + redeem
    │   ├── referralCodes.ts     referral-code attribution
    │   ├── variants.ts          option-resolver: pick → variant
    │   ├── shopify.ts           shopify catalog import (read-only)
    │   ├── shopifyCustomer.ts   shopify customer import (read-only)
    │   ├── stripe/server.ts     Stripe SDK wrapper — reads keys from install.config
    │   └── admin/               admin-side libs: products, orders, inventory, shipping, customers, collections, marketing (discounts), reviews
    ├── server/
    │   ├── ports.ts             foundation port interfaces (StoragePort, TenantPort, ActivityPort, EventBusPort, PluginInstallStorePort)
    │   ├── orders.ts            ServerOrder CRUD scoped by clientId; Stripe webhook upsert
    │   ├── billing.ts           per-install plan + subscription registry (vestigial — see chapter)
    │   ├── productsStore.ts     Product CRUD scoped by clientId (storage-backed)
    │   ├── cart.ts              cart math (lift from lib/cart.ts; foundation-port-driven)
    │   ├── foundationAdapter.ts builds an EcommerceServices container from foundation deps
    │   └── index.ts             barrel + buildEcommerceContainer(deps)
    ├── api/
    │   ├── handlers.ts          pure request/response handlers
    │   └── routes.ts            PluginApiRoute[] manifest entry
    ├── pages/
    │   ├── ProductsPage.tsx
    │   ├── ProductNewPage.tsx
    │   ├── ProductDetailPage.tsx
    │   ├── ProductVariantsPage.tsx
    │   ├── CollectionsPage.tsx
    │   ├── OrdersPage.tsx
    │   ├── OrderDetailPage.tsx
    │   ├── OrderReceiptPage.tsx
    │   ├── CustomersPage.tsx
    │   ├── CustomerDetailPage.tsx
    │   ├── InventoryPage.tsx
    │   ├── ShippingPage.tsx
    │   └── DiscountsPage.tsx
    ├── components/              client-side React (use-client)
    │   ├── CartDrawer.tsx
    │   ├── ProductDetail.tsx
    │   ├── ProductVariantPicker.tsx
    │   ├── Shop.tsx
    │   ├── FeaturedProducts.tsx
    │   ├── GiftCardPurchaseForm.tsx
    │   └── DiscountPopup.tsx
    └── context/
        └── CartContext.tsx      cart state + localStorage rehydration
```

## Stripe configuration — per install, NOT env

The webhook + checkout + billing-portal handlers read Stripe keys from
the per-install config:

```ts
install.config = {
  stripeSecretKey: "sk_test_…",         // one per client
  stripeWebhookSecret: "whsec_…",
  stripePublishableKey: "pk_test_…",     // surfaced to the storefront
  defaultCurrency: "gbp",
  successUrl: "https://luvandker.com/checkout/success",
  cancelUrl: "https://luvandker.com/cart",
}
```

Set up via the `setup` wizard on install. Operator can rotate keys
later from the plugin's settings page.

The vendored `src/lib/stripe/server.ts` is the same dynamic-import
wrapper from `02` but takes keys as a parameter instead of reading
`process.env`. The chief commander wires the foundation to load
`install.config` and pass it to the Stripe wrapper at request time.

## Block contributions (T3 owns rendering)

The manifest declares block ids only:

```ts
storefront: {
  blocks: [
    { type: "product-card",     name: "Product card",     category: "commerce", … },
    { type: "product-grid",     name: "Product grid",     category: "commerce", … },
    { type: "cart-summary",     name: "Cart summary",     category: "commerce", … },
    { type: "checkout-summary", name: "Checkout summary", category: "commerce", … },
    { type: "payment-button",   name: "Pay now",          category: "commerce", … },
    { type: "order-success",    name: "Order success",    category: "commerce", … },
    { type: "variant-picker",   name: "Variant picker",   category: "commerce", … },
    { type: "product-search",   name: "Product search",   category: "commerce", … },
  ],
}
```

T3's website-editor plugin registers concrete renderers for these block
types. Customers drag them into a portal-variant page in the editor;
when rendered, they read product/cart data via this plugin's storefront
context.

## Foundation port surface

| Port | Owner | Methods |
|------|-------|---------|
| `StoragePort` | T1 (per-install storage) | get / set / del / list |
| `TenantPort` | T1 (`server/tenants.ts`) | getClient, getClientForAgency |
| `ActivityPort` | T1 (`server/activity.ts`) | logActivity, listActivity |
| `EventBusPort` | T1 (`server/eventBus.ts`) | emit |
| `PluginInstallStorePort` | T1 (`server/pluginInstalls.ts`) | getInstall (so handlers can resolve their own install config) |

The events this plugin **emits**: `order.created`, `order.paid`,
`order.refunded`, `order.fulfilled`, `order.shipped`, `order.cancelled`,
`product.created`, `product.updated`, `product.deleted`,
`inventory.updated`, `discount.applied`.

## Verifying

```sh
cd "04-the-final-portal/plugins/ecommerce"
npm install
npm run typecheck          # tsc --noEmit
```

Currently clean as of 2026-05-04 (see commit log).

## Cross-team handoff

Files audited during the port that **don't** belong here:

| Concern | Owner | Why |
|---------|-------|-----|
| `lib/affiliates.ts` | (future affiliates plugin) | Marketing-attribution, not commerce |
| `lib/memberships.ts` | (future memberships plugin) | Subscription content gating, not products |
| `lib/donations.ts` | (future donations plugin) | One-off charity flow on top of Stripe |
| `lib/subscriptions/*` | (future subscriptions plugin) | Recurring billing |
| `block components in /editor/blocks/*.tsx` | T3 (`@aqua/plugin-website-editor`) | Block rendering belongs to the editor plugin |

The `marketing/page.tsx` admin route from 02 carried both UTM tracking
and discount codes; this port lifted only the discount slice. UTM
tracking belongs in a separate marketing plugin.

`server/billing.ts` from 02 carries SaaS-tier plan registry (starter /
pro / enterprise). It's vestigial in the new `04` model — agencies bill
their clients independently. Ported under the same name for now;
chapter §"Vestigial state" tracks the open question.
