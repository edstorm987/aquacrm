import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToReadableStream } from "next/dist/compiled/react-server-dom-webpack/server.edge";
import { createCustomerPortalRequestLoader } from "../src/app/portal/customer/_requestCache";

test("parallel customer portal chrome and body share one request snapshot", async () => {
  let aggregateLoads = 0;
  const observed: Array<{ revision: number }> = [];
  const loadSnapshot = createCustomerPortalRequestLoader(async () => ({ revision: ++aggregateLoads }));

  async function ChromeProbe() {
    const snapshot = await loadSnapshot();
    observed.push(snapshot);
    return React.createElement("span", null, `chrome:${snapshot.revision}`);
  }

  async function BodyProbe() {
    const snapshot = await loadSnapshot();
    observed.push(snapshot);
    return React.createElement("span", null, `body:${snapshot.revision}`);
  }

  const stream = renderToReadableStream(
    React.createElement(
      React.Fragment,
      null,
      React.createElement(ChromeProbe),
      React.createElement(BodyProbe),
    ),
    {},
  );
  await new Response(stream).text();

  assert.equal(aggregateLoads, 1, "one RSC request must not rebuild the customer aggregate for its body");
  assert.equal(observed.length, 2);
  assert.strictEqual(observed[0], observed[1], "chrome and body must observe the exact same snapshot object");
});

test("the mounted customer layout and built-in view use the shared request loader", async () => {
  const [layout, views, requestContext] = await Promise.all([
    readFile(new URL("../src/app/portal/customer/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/portal/customer/_CustomerPortalViews.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/portal/customer/_requestContext.ts", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /await loadCustomerPortalRequestContext\(\)/);
  assert.match(views, /await loadCustomerPortalRequestContext\(\)/);
  assert.doesNotMatch(layout, /loadCustomerPortalData/);
  assert.doesNotMatch(views, /loadCustomerPortalData/);
  assert.match(requestContext, /const data = await loadCustomerPortalData\(/);
  assert.match(requestContext, /identity\.user\?\.name\?\.trim\(\) \|\| emailDisplayName\(identity\.session\.email\)/);
});
