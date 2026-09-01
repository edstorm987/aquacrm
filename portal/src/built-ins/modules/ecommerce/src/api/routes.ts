// API route manifest. Mounted by the foundation under
// `/api/portal/ecommerce/<path>`.
//
// Routes:
//
//   GET    /products                       list products (?includeHidden=true)
//   GET    /products/get?slug=             single product
//   POST   /products                       upsert product
//   DELETE /products?slug=                 remove product
//
//   GET    /orders                         list orders for current client
//   GET    /orders/get?id=                 single order
//   POST   /orders/status                  update order status (+ tracking)
//
//   POST   /stripe/checkout                create Stripe Checkout Session
//   POST   /stripe/webhook                 Stripe webhook (signed)
//   POST   /stripe/billing-portal          mint a Stripe Billing Portal URL
//
//   GET    /discounts                      list custom discount codes
//   POST   /discounts                      upsert a custom discount code
//   DELETE /discounts?code=                remove a code
//   POST   /discounts/apply                resolve { code, subtotal } → discount
//
//   GET    /giftcards                      list issued gift cards
//   POST   /giftcards                      issue a new card
//
//   GET    /inventory                      list inventory snapshots
//   POST   /inventory                      upsert one inventory item
//   POST   /inventory/reserve              cart → SKU reservations
//
//   GET    /shipping                       zones + rates
//   POST   /shipping                       save zones / rates
//
//   GET    /collections                    list collections
//   POST   /collections                    save collections

import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  applyDiscountHandler,
  checkoutQuoteHandler,
  deleteDiscountHandler,
  deleteProductHandler,
  downloadOrderHandler,
  getOrderHandler,
  getOrderBySessionHandler,
  getProductHandler,
  issueGiftCardHandler,
  listCollectionsHandler,
  listDiscountsHandler,
  listGiftCardsHandler,
  listInventoryHandler,
  listOrdersHandler,
  listProductsHandler,
  listShippingHandler,
  reserveInventoryHandler,
  saveCollectionsHandler,
  saveShippingHandler,
  setInventoryHandler,
  stripeBillingPortalHandler,
  stripeCheckoutHandler,
  stripeWebhookHandler,
  storefrontCheckoutHandler,
  storefrontCheckoutQuoteHandler,
  storefrontGetOrderBySessionHandler,
  storefrontGetProductHandler,
  storefrontListProductsHandler,
  updateOrderStatusHandler,
  updateOrderHandler,
  upsertDiscountHandler,
  upsertProductHandler,
} from "./handlers";

export const apiRoutes: readonly PluginApiRoute[] = [
  // Products
  { path: "products", methods: ["GET"], handler: listProductsHandler },
  { path: "products/get", methods: ["GET"], handler: getProductHandler },
  { path: "products", methods: ["POST"], handler: upsertProductHandler },
  { path: "products", methods: ["DELETE"], handler: deleteProductHandler },

  // Orders
  { path: "orders", methods: ["GET"], handler: listOrdersHandler },
  { path: "orders/get", methods: ["GET"], handler: getOrderHandler },
  { path: "orders/by-session", methods: ["GET"], handler: getOrderBySessionHandler },
  { path: "orders", methods: ["PATCH"], handler: updateOrderHandler },
  { path: "orders/status", methods: ["POST"], handler: updateOrderStatusHandler },
  { path: "orders/download", methods: ["GET"], handler: downloadOrderHandler },

  // Stripe
  { path: "stripe/checkout", methods: ["POST"], handler: stripeCheckoutHandler },
  { path: "checkout/quote", methods: ["POST"], handler: checkoutQuoteHandler },
  // Stripe calls this without an Aqua session. Signature verification in the
  // handler is the authority; the exact agency/client install still comes
  // from the dispatcher scope.
  { path: "stripe/webhook", methods: ["POST"], handler: stripeWebhookHandler, public: true },
  { path: "stripe/billing-portal", methods: ["POST"], handler: stripeBillingPortalHandler },

  // Public storefront facade. These are intentionally separate from the
  // operator routes above: a guest may browse published products, obtain a
  // server quote, start checkout and read the order named by their opaque
  // provider session id. No catalogue/admin/order-list mutation is public.
  { path: "storefront/products", methods: ["GET"], handler: storefrontListProductsHandler, public: true },
  { path: "storefront/products/get", methods: ["GET"], handler: storefrontGetProductHandler, public: true },
  { path: "storefront/checkout/quote", methods: ["POST"], handler: storefrontCheckoutQuoteHandler, public: true },
  { path: "storefront/stripe/checkout", methods: ["POST"], handler: storefrontCheckoutHandler, public: true },
  { path: "storefront/orders/by-session", methods: ["GET"], handler: storefrontGetOrderBySessionHandler, public: true },

  // Discounts
  { path: "discounts", methods: ["GET"], handler: listDiscountsHandler },
  { path: "discounts", methods: ["POST"], handler: upsertDiscountHandler },
  { path: "discounts", methods: ["DELETE"], handler: deleteDiscountHandler },
  { path: "discounts/apply", methods: ["POST"], handler: applyDiscountHandler },

  // Gift cards
  { path: "giftcards", methods: ["GET"], handler: listGiftCardsHandler },
  { path: "giftcards", methods: ["POST"], handler: issueGiftCardHandler },

  // Inventory
  { path: "inventory", methods: ["GET"], handler: listInventoryHandler },
  { path: "inventory", methods: ["POST"], handler: setInventoryHandler },
  { path: "inventory/reserve", methods: ["POST"], handler: reserveInventoryHandler },

  // Shipping
  { path: "shipping", methods: ["GET"], handler: listShippingHandler },
  { path: "shipping", methods: ["POST"], handler: saveShippingHandler },

  // Collections
  { path: "collections", methods: ["GET"], handler: listCollectionsHandler },
  { path: "collections", methods: ["POST"], handler: saveCollectionsHandler },
] as const;
