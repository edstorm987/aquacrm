import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const html = readFileSync(join(process.cwd(), "public/aquacrm-site/index.html"), "utf8");
const experience = readFileSync(join(process.cwd(), "public/aquacrm-site/site-experience.js"), "utf8");

test("the public homepage fails closed when no approved founder-film source exists", () => {
  assert.match(html, /data-vsl data-youtube-url=""[^>]*hidden/);
  assert.doesNotMatch(html, /The player is ready\. Add the approved YouTube URL/);
  assert.doesNotMatch(html, />The Aqua CRM film</);
  assert.match(experience, /if \(!videoId\) return;/);
});

test("a future valid configured source is the only path that reveals the player", () => {
  assert.match(experience, /const source = shell\.dataset\.youtubeUrl \|\| window\.AQUACRM_VSL_URL \|\| "";/);
  assert.match(experience, /const videoId = youtubeId\(source\);/);
  assert.match(experience, /shell\.hidden = false;/);
});
