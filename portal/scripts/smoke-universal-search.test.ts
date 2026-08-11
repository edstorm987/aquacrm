import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const searchApi = readFileSync("src/app/api/portal/search/route.ts", "utf8");
const searchUi = readFileSync("src/components/chrome/PortalSearch.tsx", "utf8");
const socialInbox = readFileSync("src/app/portal/agency/inbox/_SocialInboxWorkspace.tsx", "utf8");
const globals = readFileSync("src/app/globals.css", "utf8");

test("universal search indexes complete website enquiries and social messages", () => {
  assert.match(searchApi, /listWebsiteEnquiries\(500\)/);
  assert.match(searchApi, /listInboxSnapshot\(agencyId\)/);
  assert.match(searchApi, /enquiry\.message/);
  assert.match(searchApi, /message\.text/);
  assert.match(searchApi, /category: "Enquiry"/);
  assert.match(searchApi, /view=\$\{view\}&form=/);
  assert.match(searchApi, /view=social&thread=/);
  assert.match(socialInbox, /searchParams\.get\("thread"\)/);
});

test("universal search ranks partial matches and returns useful context", () => {
  assert.match(searchApi, /title\.includes\(normalised\)/);
  assert.match(searchApi, /detail\.includes\(normalised\)/);
  assert.match(searchApi, /allTermsMatch/);
  assert.match(searchApi, /fuzzyTermMatch/);
  assert.match(searchApi, /contextualSnippet/);
  assert.match(searchApi, /matchedOn: matchLabel/);
  assert.match(searchApi, /SEARCH_INDEX_TTL_MS/);
  assert.match(searchUi, /\/api\/portal\/search\?warm=1/);
});

test("search palette is accessible, keyboard navigable, and uses restrained focus styling", () => {
  assert.match(searchUi, /role="combobox"/);
  assert.match(searchUi, /role="listbox"/);
  assert.match(searchUi, /aria-activedescendant/);
  assert.match(searchUi, /event\.key === "ArrowDown"/);
  assert.match(searchUi, /event\.key === "ArrowUp"/);
  assert.match(searchUi, /event\.key === "Enter"/);
  assert.match(searchUi, /aria-live="polite"/);
  assert.match(globals, /\.mm-universal-search-input:focus-visible/);
  assert.match(globals, /outline: none !important/);
});
