import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const source = readFileSync(join(
  process.cwd(),
  "src/app/(website)/portfolio/ocean-boulevard/OceanBoulevardDemo.tsx",
), "utf8");

test("Ocean Boulevard's enabled payment action completes an explicitly simulated sale", () => {
  assert.match(source, /onClick=\{takeDemoPayment\}/);
  assert.match(source, /setLastDemoPayment\(\{ amount: total, itemCount \}\)/);
  assert.match(source, /setCart\(\{\}\)/);
  assert.match(source, /Demo payment approved/);
  assert.match(source, /no card was charged/);
});

test("the simulated checkout has honest empty and reset states", () => {
  assert.match(source, /disabled=\{itemCount === 0\}/);
  assert.match(source, /Start another demo sale/);
  assert.match(source, /No real payment details are collected or charged/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /role="status"/);
});
