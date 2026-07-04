// `@aqua/plugin-ecommerce` — manifest entry.
//
// Default-exports the AquaPlugin manifest. The foundation imports this
// once at boot, validates + registers it. `scopePolicy: "client"` means
// the runtime refuses agency-scope installs.
//
// Block contributions list **ids only** — T3's `@aqua/plugin-website-editor`
// owns the rendering. The chief commander brokers the cross-plugin handoff.

import type {
  AquaPlugin,
  BlockDescriptor,
  PluginCtx,
} from "./src/lib/aquaPluginTypes";
import { apiRoutes } from "./src/api/routes";

// Block descriptors — declared here so the editor can advertise them in
// the block palette. `render` is a placeholder that throws if called
// inside this plugin. T3's website-editor plugin replaces the renderer
// at registration time via its block registry.
function delegatedRender(blockType: string): BlockDescriptor["render"] {
  return async () => ({
    default: () => {
      throw new Error(
        `Block "${blockType}" is contributed by @aqua/plugin-ecommerce but ` +
        `must be rendered by @aqua/plugin-website-editor. ` +
        `Foundation: register T3's renderer for this block type.`,
      );
    },
  });
}

const ecommerceBlocks: BlockDescriptor[] = [
  {
    type: "product-card",
    name: "Product card",
    category: "commerce",
    defaultProps: { slug: "" },
    render: delegatedRender("product-card"),
  },
  {
    type: "product-grid",
    name: "Product grid",
    category: "commerce",
    defaultProps: { collectionSlug: "", limit: 12 },
    render: delegatedRender("product-grid"),
  },
  {
    type: "cart-summary",
    name: "Cart summary",
    category: "commerce",
    defaultProps: {},
    render: delegatedRender("cart-summary"),
  },
  {
    type: "checkout-summary",
    name: "Checkout summary",
    category: "commerce",
    defaultProps: {},
    render: delegatedRender("checkout-summary"),
  },
  {
    type: "payment-button",
    name: "Pay now button",
    category: "commerce",
    defaultProps: { label: "Pay now" },
    render: delegatedRender("payment-button"),
  },
  {
    type: "order-success",
    name: "Order success",
    category: "commerce",
    defaultProps: { headline: "Thanks for your order!" },
    render: delegatedRender("order-success"),
  },
  {
    type: "variant-picker",
    name: "Variant picker",
    category: "commerce",
    defaultProps: { slug: "" },
    render: delegatedRender("variant-picker"),
  },
  {
    type: "product-search",
    name: "Product search",
    category: "commerce",
    defaultProps: { placeholder: "Search products…" },
    render: delegatedRender("product-search"),
  },
];

const ecommercePlugin: AquaPlugin = {
  id: "ecommerce",
  name: "E-commerce",
  version: "0.1.0",
  status: "beta",
  category: "commerce",
  tagline: "Products, variants, Stripe, orders.",
  description:
    "Sell physical or digital goods. Cart, Stripe Checkout, order management, " +
    "customers, inventory, shipping, discount codes, gift cards. Per-client install — " +
    "each client gets their own catalog + Stripe keys + storefront.",

  scopePolicy: "client",

  // Block renderers live in T3's website-editor plugin; the editor must
  // be installed before this plugin so the storefront can paint product
  // cards / cart summaries / checkout / order-success surfaces.
  requires: ["website-editor"],

  navItems: [
    {
      id: "ecommerce-products",
      label: "Products",
      href: "/portal/clients/:clientId/ecommerce/products",
      panelId: "store",
      order: 10,
    },
    {
      id: "ecommerce-collections",
      label: "Collections",
      href: "/portal/clients/:clientId/ecommerce/collections",
      panelId: "store",
      order: 11,
    },
    {
      id: "ecommerce-orders",
      label: "Orders",
      href: "/portal/clients/:clientId/ecommerce/orders",
      panelId: "store",
      order: 20,
    },
    {
      id: "ecommerce-customers",
      label: "Customers",
      href: "/portal/clients/:clientId/ecommerce/customers",
      panelId: "store",
      order: 30,
    },
    {
      id: "ecommerce-inventory",
      label: "Inventory",
      href: "/portal/clients/:clientId/ecommerce/inventory",
      panelId: "store",
      order: 40,
    },
    {
      id: "ecommerce-shipping",
      label: "Shipping",
      href: "/portal/clients/:clientId/ecommerce/shipping",
      panelId: "settings",
      order: 50,
    },
    {
      id: "ecommerce-discounts",
      label: "Discounts",
      href: "/portal/clients/:clientId/ecommerce/discounts",
      panelId: "marketing",
      order: 60,
    },
  ],

  pages: [
    { path: "products",                    title: "Products",      component: () => import("./src/pages/ProductsPage") },
    { path: "products/new",                title: "New product",   component: () => import("./src/pages/ProductNewPage") },
    { path: "products/:slug",              title: "Edit product",  component: () => import("./src/pages/ProductDetailPage") },
    { path: "products/:slug/variants",     title: "Variants",      component: () => import("./src/pages/ProductVariantsPage") },
    { path: "collections",                 title: "Collections",   component: () => import("./src/pages/CollectionsPage") },
    { path: "orders",                      title: "Orders",        component: () => import("./src/pages/OrdersPage") },
    { path: "orders/:id",                  title: "Order",         component: () => import("./src/pages/OrderDetailPage") },
    { path: "orders/:id/receipt",          title: "Receipt",       component: () => import("./src/pages/OrderReceiptPage") },
    { path: "customers",                   title: "Customers",     component: () => import("./src/pages/CustomersPage") },
    { path: "customers/:email",            title: "Customer",      component: () => import("./src/pages/CustomerDetailPage") },
    { path: "inventory",                   title: "Inventory",     component: () => import("./src/pages/InventoryPage") },
    { path: "shipping",                    title: "Shipping",      component: () => import("./src/pages/ShippingPage") },
    { path: "discounts",                   title: "Discounts",     component: () => import("./src/pages/DiscountsPage") },
  ],

  api: [...apiRoutes],

  storefront: {
    blocks: ecommerceBlocks,
  },

  setup: [
    {
      id: "stripe-keys",
      title: "Stripe API keys",
      description:
        "Connect this client's Stripe account so checkout, refunds, and the " +
        "billing portal work. Use TEST keys until you've validated the flow.",
      fields: [
        {
          id: "stripeSecretKey",
          label: "Stripe secret key",
          type: "password",
          required: true,
          placeholder: "sk_test_...",
          helpText: "From dashboard.stripe.com/apikeys.",
        },
        {
          id: "stripeWebhookSecret",
          label: "Stripe webhook secret",
          type: "password",
          required: true,
          placeholder: "whsec_...",
          helpText: "Created in dashboard.stripe.com/webhooks for /api/portal/ecommerce/stripe/webhook.",
        },
        {
          id: "stripePublishableKey",
          label: "Stripe publishable key",
          type: "text",
          required: false,
          placeholder: "pk_test_...",
          helpText: "Surfaced to the storefront for client-side Stripe.js.",
        },
      ],
    },
  ],

  settings: {
    groups: [
      {
        id: "stripe",
        label: "Stripe",
        description: "Stripe API keys for this client. Per-install — never env vars.",
        fields: [
          { id: "stripeSecretKey",     label: "Stripe secret key",      type: "password", placeholder: "sk_live_..." },
          { id: "stripeWebhookSecret", label: "Stripe webhook secret",  type: "password", placeholder: "whsec_..." },
          { id: "stripePublishableKey", label: "Stripe publishable key", type: "text",     placeholder: "pk_live_..." },
        ],
      },
      {
        id: "store",
        label: "Store defaults",
        fields: [
          {
            id: "defaultCurrency",
            label: "Default currency",
            type: "select",
            default: "gbp",
            options: [
              { value: "gbp", label: "GBP — British Pound" },
              { value: "usd", label: "USD — US Dollar" },
              { value: "eur", label: "EUR — Euro" },
            ],
          },
          { id: "successUrl", label: "Checkout success URL", type: "url",  placeholder: "https://luvandker.com/checkout/success" },
          { id: "cancelUrl",  label: "Checkout cancel URL",  type: "url",  placeholder: "https://luvandker.com/cart" },
          { id: "lowStockThreshold", label: "Default low-stock threshold", type: "number", default: 5 },
        ],
      },
    ],
  },

  features: [
    { id: "physicalProducts",  label: "Physical products",  default: true },
    { id: "digitalProducts",   label: "Digital products",   default: false, description: "Files / license keys delivered after payment." },
    { id: "variants",          label: "Variants",           default: true,  description: "Colour / size / format option groups." },
    { id: "inventory",         label: "Inventory tracking", default: true },
    { id: "shipping",          label: "Shipping zones + rates", default: true },
    { id: "discountCodes",     label: "Discount codes",     default: true },
    { id: "reviews",           label: "Product reviews",    default: false },
    { id: "subscriptions",     label: "Subscriptions",      default: false, description: "Recurring billing — separate plugin in a future round." },
    { id: "stripeCheckout",    label: "Stripe Checkout",    default: true },
    { id: "downloadDelivery",  label: "Digital download delivery", default: false, requires: ["digitalProducts"] },
    { id: "licenseKeys",       label: "License keys",       default: false, requires: ["digitalProducts"] },
    { id: "multiCurrency",     label: "Multi-currency",     default: false, plans: ["enterprise"] },
  ],

  async onInstall(ctx: PluginCtx, _setupAnswers: Record<string, string>): Promise<void> {
    // Seed an empty collections list so the admin page renders gracefully
    // before the operator creates one.
    await ctx.storage.set("collections", []);
  },

  // Note: deliberately NO onUninstall that wipes order data. Architecture
  // §7 + decisions log #4: config + history preserved across disable / uninstall.
  // The plugin runtime's `deleteInstall` cleans the per-install storage slice
  // when the operator explicitly uninstalls; until then orders survive.

  async healthcheck(ctx: PluginCtx) {
    const cfg = ctx.install.config as { stripeSecretKey?: string; stripeWebhookSecret?: string };
    const hasStripe = !!cfg.stripeSecretKey;
    const hasWebhook = !!cfg.stripeWebhookSecret;
    return {
      ok: hasStripe && hasWebhook,
      message: hasStripe && hasWebhook
        ? "Stripe configured."
        : "Stripe keys missing — checkout disabled.",
      components: {
        stripe: { ok: hasStripe, message: hasStripe ? "secret key present" : "missing secret key" },
        webhook: { ok: hasWebhook, message: hasWebhook ? "webhook secret present" : "missing webhook secret" },
      },
    };
  },
};

export default ecommercePlugin;
