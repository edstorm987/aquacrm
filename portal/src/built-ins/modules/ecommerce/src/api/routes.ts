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
  deleteDiscountHandler,
  deleteProductHandler,
  getOrderHandler,
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
  updateOrderStatusHandler,
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
  { path: "orders/status", methods: ["POST"], handler: updateOrderStatusHandler },

  // Stripe
  { path: "stripe/checkout", methods: ["POST"], handler: stripeCheckoutHandler },
  { path: "stripe/webhook", methods: ["POST"], handler: stripeWebhookHandler },
  { path: "stripe/billing-portal", methods: ["POST"], handler: stripeBillingPortalHandler },

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
