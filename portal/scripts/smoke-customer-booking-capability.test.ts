import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  customerAccountActivityNavItems,
  resolveCustomerAccountActivityCapabilities,
} from "../src/lib/portal/customerAccountActivity";

test("an unavailable booking capability is not advertised", () => {
  const capabilities = resolveCustomerAccountActivityCapabilities({
    registeredPluginIds: ["ecommerce"],
    enabledPluginIds: ["ecommerce"],
  });

  assert.deepEqual(capabilities, ["orders"]);
  assert.deepEqual(customerAccountActivityNavItems(capabilities).map(item => item.id), ["orders"]);
});

test("stale booking install data cannot turn a holding page into a capability", () => {
  const capabilities = resolveCustomerAccountActivityCapabilities({
    registeredPluginIds: ["bookings"],
    enabledPluginIds: ["bookings"],
  });

  assert.deepEqual(capabilities, []);
  assert.deepEqual(customerAccountActivityNavItems(capabilities), []);
});

test("registered but disabled operational capabilities stay hidden", () => {
  const capabilities = resolveCustomerAccountActivityCapabilities({
    registeredPluginIds: ["ecommerce"],
    enabledPluginIds: [],
  });

  assert.deepEqual(capabilities, []);
});

test("the real customer layout resolves exact-client capability and the direct route stays honest", () => {
  const layout = readFileSync(new URL("../src/app/portal/customer/layout.tsx", import.meta.url), "utf8");
  const chrome = readFileSync(new URL("../src/app/portal/customer/_CustomerPortalChrome.tsx", import.meta.url), "utf8");
  const bookingPage = readFileSync(new URL("../src/app/portal/customer/bookings/page.tsx", import.meta.url), "utf8");
  const subroute = readFileSync(new URL("../src/app/portal/customer/_subroute.tsx", import.meta.url), "utf8");

  assert.match(layout, /listInstalledForClientOnly/);
  assert.match(layout, /resolveCustomerAccountActivityCapabilities/);
  assert.match(chrome, /accountActivityItems\.length/);
  assert.match(bookingPage, /pluginId: "bookings"/);
  assert.match(subroute, /not available yet/);
});
