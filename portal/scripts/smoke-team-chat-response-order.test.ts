import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  TeamChatCoordinator,
  draftAfterSend,
  isPostedTeamChatSnapshot,
  isTeamChatSnapshot,
  type TeamChatSnapshot,
} from "../src/lib/client/teamChatCoordination";

// Team Chat response ordering — the pure half of issue #147's acceptance.
//
// Every case here deliberately settles responses in the WRONG order (or not at
// all) and asserts what the mounted component is allowed to paint. The mounted
// half is `scripts/browser-chat-notification-order.mjs`, which drives the real
// People → Team chat route with the same reorderings injected from the browser.

test("rapid A → B → C stays on C whatever order the selections answer", () => {
  const chat = new TeamChatCoordinator();
  const initial = chat.beginLoad();
  assert.equal(chat.acceptLoad(initial, snapshot("A")).applied, true);

  const selectB = chat.beginLoad("B", true);
  const selectC = chat.beginLoad("C", true);

  // C answers first and paints; B then answers late and must not.
  assert.equal(chat.acceptLoad(selectC, snapshot("C")).applied, true);
  assert.equal(chat.acceptLoad(selectB, snapshot("B")).applied, false);
  assert.equal(chat.desiredChannelId(), "C");
  assert.equal(chat.appliedChannelId(), "C");

  // The reverse order is equally safe: B first (dropped — C is the intent), then C.
  const again = new TeamChatCoordinator();
  again.acceptLoad(again.beginLoad(), snapshot("A"));
  const b = again.beginLoad("B", true);
  const c = again.beginLoad("C", true);
  assert.equal(again.acceptLoad(b, snapshot("B")).applied, false);
  assert.equal(again.acceptLoad(c, snapshot("C")).applied, true);
  assert.equal(again.appliedChannelId(), "C");
});

test("a delayed poll for the old channel cannot repaint the channel the operator chose", () => {
  const chat = new TeamChatCoordinator();
  chat.acceptLoad(chat.beginLoad(), snapshot("A"));

  const pollA = chat.beginLoad("A");
  const selectB = chat.beginLoad("B", true);
  assert.equal(chat.acceptLoad(selectB, snapshot("B")).applied, true);

  // The poll started before the selection and answers after it.
  assert.equal(chat.acceptLoad(pollA, snapshot("A", { messages: 9 })).applied, false);
  assert.equal(chat.appliedChannelId(), "B");

  // A poll started AFTER the selection but for the old channel (a stale timer
  // firing once more) is dropped by channel, not only by intent.
  const stalePoll = chat.beginLoad("A");
  assert.equal(chat.acceptLoad(stalePoll, snapshot("A")).applied, false);

  // And a poll for the current channel that is simply older than the newest
  // applied response is dropped by request order.
  const olderPoll = chat.beginLoad("B");
  const newerPoll = chat.beginLoad("B");
  assert.equal(chat.acceptLoad(newerPoll, snapshot("B", { messages: 3 })).applied, true);
  assert.equal(chat.acceptLoad(olderPoll, snapshot("B", { messages: 2 })).applied, false);
});

test("a late send from B cannot repaint B after switching to A, and busy still settles", () => {
  const chat = new TeamChatCoordinator();
  chat.acceptLoad(chat.beginLoad(), snapshot("B"));

  const send = chat.beginSend("post", "B");
  assert.equal(chat.pendingSendCount(), 1);
  assert.equal(chat.desiredChannelId(), "B");

  const selectA = chat.beginLoad("A", true);
  assert.equal(chat.acceptLoad(selectA, snapshot("A")).applied, true);

  // The send was retained by the server; its response arrives after the switch.
  const outcome = chat.acceptSend(send, snapshot("B", { messages: 4 }));
  assert.equal(outcome.applied, false);
  assert.equal(chat.appliedChannelId(), "A");
  assert.equal(chat.desiredChannelId(), "A");
  // The composer is not pinned disabled by a send the operator walked away from.
  assert.equal(chat.pendingSendCount(), 0);

  // Same for a send that FAILS after the switch: it settles, and it does not
  // paint. Its failure is still surfaced because no newer send superseded it.
  const failing = chat.beginSend("post", "A");
  chat.acceptLoad(chat.beginLoad("B", true), snapshot("B"));
  const failed = chat.rejectSend(failing);
  assert.equal(failed.applied, false);
  assert.equal(failed.exposeFailure, true);
  assert.equal(chat.pendingSendCount(), 0);
});

test("a rejected send exposes its failure only while it is the latest send", () => {
  const chat = new TeamChatCoordinator();
  chat.acceptLoad(chat.beginLoad(), snapshot("A"));

  const first = chat.beginSend("post", "A");
  const second = chat.beginSend("post", "A");
  assert.equal(chat.pendingSendCount(), 2);

  // The older send fails after a newer one began: no error for a superseded intent.
  assert.equal(chat.rejectSend(first).exposeFailure, false);
  assert.equal(chat.pendingSendCount(), 1);

  // The newest send fails: that IS the operator's current intent.
  assert.equal(chat.rejectSend(second).exposeFailure, true);
  assert.equal(chat.pendingSendCount(), 0);

  // A successful newer send after a failed older one paints normally.
  const third = chat.beginSend("post", "A");
  assert.equal(chat.acceptSend(third, snapshot("A", { messages: 2 })).applied, true);
  assert.equal(chat.pendingSendCount(), 0);
});

test("a failed selection keeps the conversation that is actually painted", () => {
  const chat = new TeamChatCoordinator();
  chat.acceptLoad(chat.beginLoad(), snapshot("A"));

  // B was wanted but never arrived; C was then wanted and failed. The valid
  // conversation is A — not B, which never painted.
  const selectB = chat.beginLoad("B", true);
  const selectC = chat.beginLoad("C", true);
  const failedC = chat.rejectLoad(selectC);
  assert.equal(failedC.exposeFailure, true);
  assert.equal(chat.desiredChannelId(), "A");
  assert.equal(chat.appliedChannelId(), "A");

  // B's late answer is still a superseded intent, so it stays dropped.
  assert.equal(chat.acceptLoad(selectB, snapshot("B")).applied, false);

  // A failure for a superseded selection is not shown at all.
  const selectD = chat.beginLoad("D", true);
  const selectE = chat.beginLoad("E", true);
  assert.equal(chat.rejectLoad(selectD).exposeFailure, false);
  assert.equal(chat.acceptLoad(selectE, snapshot("E")).applied, true);
});

test("opening a direct conversation adopts the channel the server answers with", () => {
  const chat = new TeamChatCoordinator();
  chat.acceptLoad(chat.beginLoad(), snapshot("A"));
  const open = chat.beginSend("open-direct", null);
  assert.equal(chat.acceptSend(open, snapshot("direct:sam")).applied, true);
  assert.equal(chat.appliedChannelId(), "direct:sam");
  assert.equal(chat.desiredChannelId(), "direct:sam");
  assert.equal(chat.pendingSendCount(), 0);
});

test("late responses belong to the instance that started them, never to a new one", () => {
  const first = new TeamChatCoordinator();
  const held = first.beginSend("post", "B");
  // The component unmounts and a fresh instance mounts with its own coordinator.
  const second = new TeamChatCoordinator();
  assert.equal(second.acceptLoad(second.beginLoad(), snapshot("B")).applied, true);
  // The held send settles against the OLD coordinator only.
  assert.equal(first.acceptSend(held, snapshot("B", { messages: 5 })).applied, true);
  assert.equal(second.pendingSendCount(), 0);
  assert.equal(second.appliedChannelId(), "B");
});

test("only a well-formed snapshot may paint, and only one carrying the sent message counts as sent", () => {
  const valid = snapshot("B", { messages: 1 });
  assert.equal(isTeamChatSnapshot(valid), true);
  assert.equal(isTeamChatSnapshot({ ...valid, ok: false }), false);
  assert.equal(isTeamChatSnapshot({ ...valid, messages: undefined }), false);
  assert.equal(isTeamChatSnapshot({ ...valid, messages: [{ id: "m", body: 3 }] }), false);
  assert.equal(isTeamChatSnapshot({ ...valid, channels: [{ id: "B" }] }), false);
  assert.equal(isTeamChatSnapshot({ ...valid, roster: [{ userId: "u" }] }), false);
  assert.equal(isTeamChatSnapshot({ ...valid, activeChannelId: 1 }), false);
  assert.equal(isTeamChatSnapshot("not json"), false);
  assert.equal(isTeamChatSnapshot(null), false);

  const posted = snapshot("B", { messages: 0 });
  posted.messages.push({ id: "mine", agencyId: "agency", channelId: "B", authorUserId: "self", authorName: "Me", body: "hello there", createdAt: 10 });
  assert.equal(isPostedTeamChatSnapshot(posted, { channelId: "B", body: "  hello there  " }), true);
  // Wrong channel, someone else's message, or a different body: not sent.
  assert.equal(isPostedTeamChatSnapshot(posted, { channelId: "A", body: "hello there" }), false);
  assert.equal(isPostedTeamChatSnapshot(posted, { channelId: "B", body: "hello" }), false);
  const theirs = { ...posted, messages: posted.messages.map(message => ({ ...message, authorUserId: "other" })) };
  assert.equal(isPostedTeamChatSnapshot(theirs, { channelId: "B", body: "hello there" }), false);
  // `ok: true` with nothing else is the malformed-2xx case.
  assert.equal(isPostedTeamChatSnapshot({ ok: true }, { channelId: "B", body: "hello there" }), false);
});

test("only a validated success clears the exact submitted draft", () => {
  const drafts = { A: "keep me", B: "send me" };
  // Failure of any kind retains every draft byte for byte.
  assert.deepEqual(draftAfterSend(drafts, "B", "send me", "failure"), drafts);
  // Success clears the sent draft and nobody else's.
  assert.deepEqual(draftAfterSend(drafts, "B", "send me", "success"), { A: "keep me" });
  // A draft edited since it was submitted belongs to the operator, not the send.
  assert.deepEqual(draftAfterSend({ ...drafts, B: "send me, and more" }, "B", "send me", "success"), { A: "keep me", B: "send me, and more" });
  // Inputs are never mutated.
  assert.deepEqual(drafts, { A: "keep me", B: "send me" });
});

test("the mounted Team Chat sends through the coordinator and keeps drafts until validated success", () => {
  const source = readFileSync(new URL("../src/components/people/TeamChat.tsx", import.meta.url), "utf8");
  assert.match(source, /new TeamChatCoordinator\(\)/);
  assert.match(source, /coordinator\.beginLoad\(channelId, isSelection\)/);
  assert.match(source, /coordinator\.acceptLoad\(token, snapshot\)/);
  assert.match(source, /coordinator\.rejectLoad\(token\)/);
  assert.match(source, /coordinator\.beginSend\(action, postingChannel\)/);
  assert.match(source, /coordinator\.acceptSend\(token, snapshot\)/);
  assert.match(source, /coordinator\.rejectSend\(token\)/);
  // Busy is derived from in-flight sends, so it settles even after a channel switch.
  assert.match(source, /setBusy\(\(coordinatorRef\.current\?\.pendingSendCount\(\) \?\? 0\) > 0\)/);
  // The draft is controlled state, never a DOM value wiped on submit.
  assert.doesNotMatch(source, /input\.value = ""/);
  assert.match(source, /value=\{draft\}/);
  assert.match(source, /draftAfterSend\(current, postingChannel, submitted, "success"\)/);
  // Sends go through the checked mutation boundary with the posted-message validator.
  assert.match(source, /checkedJsonMutation<ChatSnapshot>\("\/api\/portal\/team-chat"/);
  assert.match(source, /isPostedTeamChatSnapshot\(result, \{ channelId: postingChannel, body: submitted \}\)/);
  // Loads validate the shape before painting.
  assert.match(source, /!response\.ok \|\| !isTeamChatSnapshot\(result\)/);
  // Failures are announced, and a late response after unmount changes nothing.
  assert.match(source, /<p role="alert"/);
  assert.match(source, /if \(!mountedRef\.current \|\| !outcome\.applied\) return;/);
  // View-only access neither posts nor opens conversations.
  assert.match(source, /if \(!canUse\) return false;/);
  assert.match(source, /disabled=\{busy \|\| !canUse\}/);
  assert.match(source, /\{canUse \? <form onSubmit=\{submit\}/);
});

function snapshot(activeChannelId: string, options: { messages?: number } = {}): TeamChatSnapshot {
  const count = options.messages ?? 1;
  return {
    channels: ["A", "B", "C", "D", "E", "direct:sam"].map(id => ({
      id,
      agencyId: "agency",
      kind: id === "A" ? "team" as const : "direct" as const,
      name: id,
      memberUserIds: id === "A" ? [] : ["self", id],
      createdAt: 1,
      updatedAt: 1,
    })),
    activeChannelId,
    messages: Array.from({ length: count }, (_, index) => ({
      id: `${activeChannelId}-${index}`,
      agencyId: "agency",
      channelId: activeChannelId,
      authorUserId: "other",
      authorName: "Other",
      body: `message ${index} in ${activeChannelId}`,
      createdAt: index + 1,
    })),
    roster: [
      { userId: "self", name: "Me", presence: { state: "online" }, workingToday: true },
      { userId: "other", name: "Other", presence: { state: "offline" }, workingToday: false },
    ],
    selfUserId: "self",
  };
}
