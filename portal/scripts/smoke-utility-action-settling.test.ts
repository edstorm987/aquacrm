import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { checkedJsonMutation, mutationErrorMessage } from "../src/lib/client/checkedMutation";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function between(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Could not isolate ${start}`);
  return source.slice(from, to);
}

test("a rejected checked utility request reports failure and the caller can always settle pending state", async () => {
  let pending = true;
  let message = "";
  try {
    await checkedJsonMutation<{ ok: boolean }>("/utility", { method: "GET" }, {
      fallback: "Utility unavailable.",
      fetcher: async () => { throw new Error("offline"); },
    });
  } catch (error) {
    message = mutationErrorMessage(error, "Utility unavailable.");
  } finally {
    pending = false;
  }

  assert.equal(pending, false);
  assert.match(message, /Utility unavailable.*connection.*try again/i);
});

test("Task Templates leaves loading through finally and exposes an explicit retry", () => {
  const source = read("src/components/attention/TaskTemplates.tsx");
  const load = between(source, "async function load(", "\n  useEffect(");

  assert.match(load, /checkedJsonMutation/);
  assert.match(load, /catch \(nextError\)/);
  assert.match(load, /finally/);
  assert.match(load, /setLoadingTemplates\(false\)/);
  assert.match(source, /role="alert"/);
  assert.match(source, /Retry templates/);
  assert.doesNotMatch(load, /await\s+fetch\s*\(/);
});

test("Development resource paging and credential reveal settle and retain retryable errors", () => {
  const source = read("src/app/portal/agency/development/_DevelopmentToolkitWorkspace.tsx");
  const loadMore = between(source, "async function loadMore(", "\n  function editResource");
  const reveal = between(source, "async function reveal(", "\n  const openUrl");

  for (const block of [loadMore, reveal]) {
    assert.match(block, /checkedJsonMutation/);
    assert.match(block, /catch \(nextError\)/);
    assert.match(block, /finally/);
  }
  assert.match(loadMore, /setLoadingResources\(false\)/);
  assert.match(reveal, /setRevealing\(false\)/);
  assert.match(source, /Retry more/);
  assert.match(source, /Retry resources/);
  assert.match(source, /Retry with the reveal button/);
});

test("Search Console distinguishes unavailable from empty and offers a retry", () => {
  const source = read("src/app/portal/agency/performance/_AquaTagDashboard.tsx");
  const load = between(source, "const loadConnections", "\n\n  useEffect(");
  const sync = between(source, "async function sync(", "\n\n  return (");

  assert.match(load, /checkedJsonMutation/);
  assert.match(load, /setLoadState\("error"\)/);
  assert.match(load, /finally/);
  assert.match(sync, /finally/);
  assert.match(source, /Retry connection check/);
  assert.match(source, /Connection status is unavailable/);
  assert.doesNotMatch(load, /setConnections\(\[\]\).*catch/s);
});

test("Copy Tag makes one clipboard attempt and reports both success and refusal", () => {
  const source = read("src/app/portal/clients/[clientId]/_ClientSystemsWorkspace.tsx");
  const copy = between(source, "async function copySnippet(", "\n\n  async function testConnection");
  const writes = [...copy.matchAll(/navigator\.clipboard\.writeText\(/g)];

  assert.equal(writes.length, 1);
  assert.ok(copy.indexOf("await navigator.clipboard.writeText") < copy.indexOf("setCopied(true)"));
  assert.match(copy, /catch/);
  assert.match(copy, /setCopyError/);
  assert.match(source, /Select the snippet above and copy it manually/);
  assert.match(source, /\{copied \? "Copied" : "Copy tag"\}/);
});
