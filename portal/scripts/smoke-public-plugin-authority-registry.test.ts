import assert from "node:assert/strict";
import test from "node:test";

import { listPlugins } from "../src/built-ins/runtime/_registry";
import {
  isClassifiedPublicPluginRoute,
  PLUGIN_PUBLIC_ROUTE_AUTHORITIES,
} from "../src/lib/server/portal/pluginPublicRouteAuthority";
import {
  exactProviderAgencyScope,
  exactProviderClientScope,
} from "../src/lib/server/portal/providerWebhookScope";

test("every mounted anonymous plugin route declares a known authority class", () => {
  const shipped = listPlugins().filter(plugin => !plugin.id.startsWith("zz-"));
  const publicRoutes = shipped.flatMap(plugin => plugin.api
    .filter(route => route.public === true)
    .map(route => `${plugin.id}:${route.path}:${route.publicAuthority ?? "missing"}`))
    .sort();

  assert.equal(publicRoutes.length, 15);
  assert.deepEqual(publicRoutes, [
    "affiliates:webhooks/stripe:provider-webhook",
    "agency-finance:stripe/webhook:provider-webhook",
    "ecommerce:storefront/checkout/quote:storefront-read",
    "ecommerce:storefront/orders/by-session:storefront-read",
    "ecommerce:storefront/products/get:storefront-read",
    "ecommerce:storefront/products:storefront-read",
    "ecommerce:storefront/stripe/checkout:storefront-checkout",
    "ecommerce:stripe/webhook:provider-webhook",
    "email-sender:public/webhook/postmark:provider-webhook",
    "leads-pipeline:commercial/stripe-webhook:provider-webhook",
    "memberships:stripe/webhook:provider-webhook",
    "website-editor:public/blog/posts/by-slug:published-site-read",
    "website-editor:public/blog/posts:published-site-read",
    "website-editor:visitor/contact:published-site-write",
    "website-editor:visitor/newsletter:published-site-write",
  ]);
  for (const plugin of shipped) {
    for (const route of plugin.api.filter(candidate => candidate.public === true)) {
      assert.equal(isClassifiedPublicPluginRoute(route), true);
    }
  }
});

test("public route classification fails closed when missing or invented", () => {
  const handler = async () => new Response(null, { status: 204 });
  assert.equal(isClassifiedPublicPluginRoute({ path: "x", methods: ["GET"], handler, public: true }), false);
  assert.equal(isClassifiedPublicPluginRoute({
    path: "x",
    methods: ["GET"],
    handler,
    public: true,
    publicAuthority: "invented" as (typeof PLUGIN_PUBLIC_ROUTE_AUTHORITIES)[number],
  }), false);
  assert.equal(isClassifiedPublicPluginRoute({
    path: "x",
    methods: ["GET"],
    handler,
    public: true,
    publicAuthority: "published-site-read",
  }), true);
});

test("provider webhook metadata is exact-tenant and exact-client bound", () => {
  const metadata = { agencyId: "agency-a", clientId: "client-a" };
  assert.equal(exactProviderAgencyScope(metadata, "agency-a"), true);
  assert.equal(exactProviderAgencyScope(metadata, "agency-b"), false);
  assert.equal(exactProviderAgencyScope(undefined, "agency-a"), false);
  assert.equal(exactProviderClientScope(metadata, "agency-a", "client-a"), true);
  assert.equal(exactProviderClientScope(metadata, "agency-a", "client-b"), false);
  assert.equal(exactProviderClientScope(metadata, "agency-b", "client-a"), false);
  assert.equal(exactProviderClientScope(metadata, "agency-a", undefined), false);
});
