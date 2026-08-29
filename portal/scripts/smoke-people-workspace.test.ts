import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it, before } from "node:test";

process.env.PORTAL_BACKEND = "memory";

describe("People lifecycle and employee workspace", () => {
  before(async () => {
    const { ensureHydrated, reset } = await import("../src/server/storage");
    await ensureHydrated();
    await reset();
  });

  it("retains one identity from application into employee onboarding", async () => {
    const people = await import("../src/server/people");
    const { getState } = await import("../src/server/storage");
    const created = people.createPeopleApplication({
      agencyId: "agency_people",
      name: "Alex Example",
      email: "alex@example.test",
      roleInterest: "Photographer",
      employmentPreference: "freelancer",
      cv: { fileName: "alex.pdf", contentType: "application/pdf", size: 1200, storageProvider: "local", storageKey: "alex.pdf" },
    });
    assert.equal(people.getPeopleApplicationByToken(created.statusToken)?.id, created.application.id);
    const employee = people.createPeopleEmployee({
      agencyId: "agency_people",
      actorUserId: "owner_1",
      applicationId: created.application.id,
      name: created.application.name,
      email: created.application.email,
      title: "Photographer",
      employmentType: "freelancer",
    });
    assert.equal(getState().peopleApplications[created.application.id].employeeId, employee.id);
    assert.equal(getState().peopleApplications[created.application.id].stage, "onboarding");
    assert.equal(employee.workspaceAccess[0].stationId, "my-day");
    assert.ok(employee.onboardingItems.length >= 7);
  });

  it("surfaces unread direct messages and @mentions of the owner as chat attention", async () => {
    const people = await import("../src/server/people");
    const { createUser } = await import("../src/server/users");
    const agencyId = "agency_chat";
    const password = "Smoke-pass-123!";
    const owner = createUser({ email: "ed@chat.test", password, name: "Ed Founder", role: "agency-owner", agencyId });
    const sam = createUser({ email: "sam@chat.test", password, name: "Sam Taylor", role: "agency-staff", agencyId });

    // Sam sends Ed a 1:1 direct message → an unread direct for the owner.
    const direct = people.ensureDirectChannel(agencyId, owner.id, sam.id);
    people.postPeopleMessage({ agencyId, channelId: direct.id, authorUserId: sam.id, body: "Hi Ed, quick question about the deck" });

    // Sam @mentions Ed in the team channel → the mention is parsed and is unread…
    const team = people.ensureTeamChannel(agencyId);
    const mention = people.postPeopleMessage({ agencyId, channelId: team.id, authorUserId: sam.id, body: "Can @Ed sign off on this before 5?" });
    assert.deepEqual(mention.mentions, [owner.id]);
    // …but a plain team message (no mention) must NOT raise owner attention.
    people.postPeopleMessage({ agencyId, channelId: team.id, authorUserId: sam.id, body: "Morning all, standup in 10" });

    const attention = people.ownerChatAttention(agencyId);
    assert.ok(attention, "owner has chat attention");
    assert.equal(attention.directCount, 1);
    assert.equal(attention.mentionCount, 1);
    assert.equal(attention.total, 2);

    // Reading both channels clears it; the owner's own later message doesn't re-alert them.
    people.markChannelRead(agencyId, direct.id, owner.id);
    people.markChannelRead(agencyId, team.id, owner.id);
    assert.equal(people.ownerChatAttention(agencyId), null);
    people.postPeopleMessage({ agencyId, channelId: team.id, authorUserId: owner.id, body: "Thanks all" });
    assert.equal(people.ownerChatAttention(agencyId), null);
  });

  // Issue #21. `listPeopleChannels` used to call `ensureTeamChannel`, which
  // CREATES the channel — so reading the chat wrote to storage, and the chain
  // reached all the way up to the agency layout through the Radar's operational
  // alerts. Reading must not create; posting must.
  it("reading the chat does not create the team channel — posting does", async () => {
    const people = await import("../src/server/people");
    const { getState } = await import("../src/server/storage");
    const { createUser } = await import("../src/server/users");
    const agencyId = "agency_readonly_chat";
    const owner = createUser({ email: "owner@readonly.test", password: "Smoke-pass-123!", name: "Ola Owner", role: "agency-owner", agencyId });

    const channelsBefore = Object.values(getState().peopleChannels ?? {}).filter(c => c.agencyId === agencyId);
    assert.equal(channelsBefore.length, 0, "the fixture already has channels, so this proves nothing");

    // Every read shape: the list, the snapshot the UI renders, and the owner
    // attention the Command Centre alert asks for.
    const listed = people.listPeopleChannels(agencyId, owner.id);
    people.teamChatSnapshot(agencyId, owner.id);
    people.ownerChatAttention(agencyId);
    assert.equal(
      Object.values(getState().peopleChannels ?? {}).filter(c => c.agencyId === agencyId).length, 0,
      "reading the chat created a channel — a GET that writes cannot be cached, replicated or run read-only");

    // The reader still SEES a team channel, and it is usable.
    const team = listed.find(channel => channel.kind === "team");
    assert.ok(team, "a reader with no saved channel sees no team channel at all");
    assert.equal(people.listPeopleMessages(agencyId, team.id).length, 0);

    // Posting materialises it — under the SAME id the reader was already
    // holding, which is the whole reason the id is derived from the agency.
    const message = people.postPeopleMessage({ agencyId, channelId: team.id, authorUserId: owner.id, body: "First post" });
    assert.equal(message.channelId, team.id);
    const saved = Object.values(getState().peopleChannels ?? {}).filter(c => c.agencyId === agencyId);
    assert.equal(saved.length, 1, "posting did not persist the team channel");
    assert.equal(saved[0]!.id, team.id, "the saved channel has a different id from the one the reader was shown");

    // …and a second read does not make another one.
    people.listPeopleChannels(agencyId, owner.id);
    assert.equal(Object.values(getState().peopleChannels ?? {}).filter(c => c.agencyId === agencyId).length, 1);
  });

  it("an agency that already had a generated team-channel id keeps it", async () => {
    const people = await import("../src/server/people");
    const { getState, mutate } = await import("../src/server/storage");
    const agencyId = "agency_legacy_chat";
    // A channel as it was created before the id became deterministic.
    const legacyId = "channel_legacy_random";
    mutate(state => {
      state.peopleChannels[legacyId] = { id: legacyId, agencyId, kind: "team", name: "Team", memberUserIds: [], createdAt: 1, updatedAt: 1 };
    });
    const team = people.listPeopleChannels(agencyId, "usr_anyone").find(channel => channel.kind === "team");
    assert.equal(team?.id, legacyId, "an existing team channel was shadowed by a new deterministic one");
    assert.equal(people.ensureTeamChannel(agencyId).id, legacyId);
    assert.equal(
      Object.values(getState().peopleChannels ?? {}).filter(c => c.agencyId === agencyId).length, 1,
      "the agency ended up with two team channels");
  });

  it("the team chat UI highlights @mentions and hints how to mention", () => {
    const teamChat = readFileSync("src/components/people/TeamChat.tsx", "utf8");
    // Mentions that resolve to a roster member are rendered specially (not plain text)…
    assert.match(teamChat, /function renderBody/);
    assert.match(teamChat, /renderBody\(message\.body, snap\.roster/);
    // …and the composer tells people how to notify someone.
    assert.match(teamChat, /@name to notify someone/);
  });

  it("normalises station access and never allows My Day to disappear", async () => {
    const people = await import("../src/server/people");
    const access = people.normalizePeopleAccess([
      { stationId: "pay", mode: "view", order: 9 },
      { stationId: "actions", mode: "edit", order: 8 },
      { stationId: "actions", mode: "view", order: 7 },
    ]);
    assert.deepEqual(access.map(item => item.stationId), ["my-day", "pay", "actions"]);
    assert.equal(access[2].mode, "edit");
  });

  it("calculates weekday leave and scopes employee snapshots", async () => {
    const people = await import("../src/server/people");
    const employee = people.listPeopleEmployees("agency_people")[0];
    people.updatePeopleEmployee("agency_people", employee.id, { userId: "user_alex", status: "active" }, "owner_1");
    const leave = people.createPeopleLeaveRequest({ agencyId: "agency_people", employeeId: employee.id, type: "annual", startsOn: "2026-08-14", endsOn: "2026-08-17" });
    assert.equal(leave.days, 2);
    const snapshot = people.employeePeopleSnapshot("agency_people", "user_alex");
    assert.equal(snapshot?.employee.id, employee.id);
    assert.equal(snapshot?.leaveRequests.length, 1);
    assert.equal(people.canUsePeopleStation("agency_people", "user_alex", "pay", true), false);
    assert.equal(people.canUsePeopleStation("agency_people", "user_alex", "actions", true), true);
  });
});

describe("Staff Command directory and per-person card", () => {
  const AGENCY = "agency_staff";
  const NOW = Date.UTC(2026, 7, 19, 12, 0, 0); // fixed clock so day/presence maths is deterministic

  before(async () => {
    const { ensureHydrated, reset, mutate } = await import("../src/server/storage");
    const people = await import("../src/server/people");
    const tasks = await import("../src/server/tasks");
    await ensureHydrated();
    await reset();

    // Owner + one staff member as real users (owner is derived from the
    // agency-owner user, staff has a People record).
    mutate(state => {
      for (const seed of [
        { id: "user_ed", email: "ed@staff.test", name: "Ed Owner", role: "agency-owner" as const },
        { id: "user_sam", email: "sam@staff.test", name: "Sam Staff", role: "agency-staff" as const },
      ]) {
        state.users[seed.id] = {
          id: seed.id, email: seed.email, name: seed.name, passwordHash: "x",
          role: seed.role, agencyId: AGENCY, agencyIds: [AGENCY],
          createdAt: NOW, updatedAt: NOW,
        };
      }
    });

    const sam = people.createPeopleEmployee({
      agencyId: AGENCY, actorUserId: "user_ed", userId: "user_sam",
      name: "Sam Staff", email: "sam@staff.test", title: "Designer", employmentType: "full-time",
    });
    people.updatePeopleEmployee(AGENCY, sam.id, { holidayAllowanceDays: 28 }, "user_ed");
    people.decidePeopleLeaveRequest({
      agencyId: AGENCY,
      requestId: people.createPeopleLeaveRequest({ agencyId: AGENCY, employeeId: sam.id, type: "annual", startsOn: "2026-08-10", endsOn: "2026-08-12" }).id,
      status: "approved", actorUserId: "user_ed",
    });

    // Two work sessions on different days — one still open (online) — and two
    // tasks assigned to Sam (one done).
    mutate(state => {
      state.dashboardWorkSessions.sess_1 = { id: "sess_1", agencyId: AGENCY, userId: "user_sam", date: "2026-08-18", startedAt: NOW - 86_400_000, endedAt: NOW - 86_400_000 + 3_600_000, aquaActiveMs: 3_600_000, createdAt: NOW, updatedAt: NOW };
      state.dashboardWorkSessions.sess_2 = { id: "sess_2", agencyId: AGENCY, userId: "user_sam", date: "2026-08-19", startedAt: NOW - 1_800_000, aquaActiveMs: 1_200_000, externalWorkMs: 600_000, lastHeartbeatAt: NOW - 60_000, createdAt: NOW, updatedAt: NOW };
    });
    tasks.createAgencyTask({ agencyId: AGENCY, title: "Design the homepage", assigneeUserId: "user_sam", createdBy: "user_ed" });
    const done = tasks.createAgencyTask({ agencyId: AGENCY, title: "Ship the logo", assigneeUserId: "user_sam", createdBy: "user_ed" });
    tasks.updateAgencyTask(AGENCY, done.id, { status: "done" }, "user_ed");
  });

  it("lists every person including the derived owner, owner first", async () => {
    const people = await import("../src/server/people");
    const directory = people.staffDirectory(AGENCY, NOW);
    assert.equal(directory.length, 2, "owner (derived) + one staff record");
    assert.equal(directory[0].isOwner, true);
    assert.equal(directory[0].id, "owner:user_ed");
    assert.equal(directory[0].employeeId, undefined, "owner has no People record — synthesised");
    const sam = directory.find(entry => entry.userId === "user_sam");
    assert.equal(sam?.isOwner, false);
    assert.equal(sam?.openTasks, 1, "one of two assigned tasks is still open");
  });

  it("does not double-list an owner who also has a People record", async () => {
    const people = await import("../src/server/people");
    const owner = people.createPeopleEmployee({ agencyId: AGENCY, actorUserId: "user_ed", userId: "user_ed", name: "Ed Owner", email: "ed@staff.test", title: "Founder", employmentType: "full-time" });
    const directory = people.staffDirectory(AGENCY, NOW);
    assert.equal(directory.length, 2, "still two rows — the owner's record is marked, not added");
    const ownerRow = directory.find(entry => entry.isOwner);
    assert.equal(ownerRow?.employeeId, owner.id, "owner row is now the real record");
    // Clean the record back off so the remaining assertions see the derived owner.
    people.updatePeopleEmployee(AGENCY, owner.id, { status: "alumni" }, "user_ed");
    const { mutate } = await import("../src/server/storage");
    mutate(state => { delete state.peopleEmployees[owner.id]; });
  });

  it("aggregates a staff card: days worked, presence, holiday and tasks", async () => {
    const people = await import("../src/server/people");
    const sam = people.listPeopleEmployees(AGENCY).find(employee => employee.userId === "user_sam");
    assert.ok(sam);
    const card = people.staffCard(AGENCY, sam!.id, NOW);
    assert.ok(card);
    assert.equal(card!.work.daysWorked, 2, "two distinct session days");
    assert.equal(card!.work.loggedMs, 3_600_000 + 1_800_000, "productive = aqua + external across sessions");
    assert.equal(card!.work.openTasks, 1);
    assert.equal(card!.work.doneTasks, 1);
    assert.equal(card!.tasks.length, 2, "both assigned tasks travel with the card");
    assert.equal(card!.entry.presence.state, "online", "sess_2 is open with a fresh heartbeat → online");
    assert.equal(card!.entry.presence.online, true, "online mirror matches state");
    assert.equal(card!.holiday.usedDays, 3, "approved Mon–Wed leave = 3 inclusive working days used");
    assert.equal(card!.holiday.remainingDays, 25);
  });

  it("builds the derived owner card through its synthetic id", async () => {
    const people = await import("../src/server/people");
    const card = people.staffCard(AGENCY, "owner:user_ed", NOW);
    assert.ok(card);
    assert.equal(card!.employee, null, "owner card carries no People record");
    assert.equal(card!.entry.isOwner, true);
    assert.equal(people.staffCard(AGENCY, "owner:user_nobody", NOW), null, "unknown owner id resolves to null");
  });

  it("runs a freelancer job through proposed → active → delivered → paid", async () => {
    const people = await import("../src/server/people");
    const freelancer = people.createPeopleEmployee({ agencyId: AGENCY, actorUserId: "user_ed", name: "Fran Freelance", email: "fran@staff.test", title: "Illustrator", employmentType: "freelancer" });
    const job = people.savePeopleFreelancerJob({ agencyId: AGENCY, actorUserId: "user_ed", employeeId: freelancer.id, title: "Brand illustration set", feeMinor: 80_000, currency: "gbp", dueOn: "2026-09-01" });
    assert.equal(job.status, "proposed");
    assert.equal(job.currency, "GBP", "currency is upper-cased");
    assert.equal(job.feeMinor, 80_000);
    assert.equal(job.deliveredAt, undefined);
    // Its card carries it; a non-freelancer's card does not.
    const card = people.staffCard(AGENCY, freelancer.id, NOW);
    assert.equal(card!.freelancerJobs.length, 1);
    const delivered = people.setPeopleFreelancerJobStatus({ agencyId: AGENCY, jobId: job.id, status: "delivered", actorUserId: "user_ed" });
    assert.ok(delivered!.deliveredAt, "delivered stamps a timestamp");
    assert.equal(delivered!.paidAt, undefined);
    const paid = people.setPeopleFreelancerJobStatus({ agencyId: AGENCY, jobId: job.id, status: "paid", actorUserId: "user_ed", paymentRef: "FIN-123" });
    assert.ok(paid!.paidAt, "paid stamps a timestamp");
    assert.equal(paid!.deliveredAt, delivered!.deliveredAt, "delivered timestamp is preserved through paid");
    assert.equal(paid!.paymentRef, "FIN-123", "finance reference recorded on payment");
    assert.equal(people.setPeopleFreelancerJobStatus({ agencyId: AGENCY, jobId: "nope", status: "paid", actorUserId: "user_ed" }), null, "unknown job → null");
    assert.throws(() => people.savePeopleFreelancerJob({ agencyId: AGENCY, actorUserId: "user_ed", employeeId: "ghost", title: "x" }), /not found/i, "job needs a real person");
  });

  it("awards recognition and surfaces the current employee of the month", async () => {
    const people = await import("../src/server/people");
    const sam = people.listPeopleEmployees(AGENCY).find(employee => employee.userId === "user_sam");
    assert.ok(sam);
    assert.equal(people.currentEmployeeOfMonth(AGENCY), null, "nobody recognised yet");
    people.awardPeopleRecognition({ agencyId: AGENCY, actorUserId: "user_ed", employeeId: sam!.id, kind: "shoutout", note: "Great launch" });
    assert.equal(people.currentEmployeeOfMonth(AGENCY), null, "a shoutout is not employee of the month");
    people.awardPeopleRecognition({ agencyId: AGENCY, actorUserId: "user_ed", employeeId: sam!.id, kind: "employee-of-month", period: "2026-08", note: "Carried the quarter" });
    const eotm = people.currentEmployeeOfMonth(AGENCY);
    assert.equal(eotm?.employeeId, sam!.id);
    assert.equal(people.staffDirectory(AGENCY, NOW).find(entry => entry.employeeId === sam!.id)?.isEmployeeOfMonth, true, "directory marks the EOTM");
    assert.equal(people.staffCard(AGENCY, sam!.id, NOW)!.recognitions.length, 2, "both awards travel on the card");
    assert.throws(() => people.awardPeopleRecognition({ agencyId: AGENCY, actorUserId: "user_ed", employeeId: "ghost", kind: "shoutout" }), /not found/i);
  });

  it("offers only unassigned or owner-held open work as delegatable", async () => {
    const people = await import("../src/server/people");
    const tasks = await import("../src/server/tasks");
    const ownerTask = tasks.createAgencyTask({ agencyId: AGENCY, title: "Owner-held thing", assigneeUserId: "user_ed", createdBy: "user_ed" });
    const looseTask = tasks.createAgencyTask({ agencyId: AGENCY, title: "Nobody owns this", createdBy: "user_ed" });
    const ids = people.delegatableTasks(AGENCY).map(task => task.id);
    assert.ok(ids.includes(ownerTask.id), "owner's own open work can be handed off");
    assert.ok(ids.includes(looseTask.id), "unassigned open work can be handed off");
    // Sam's assigned tasks (from setup) are already delegated → not in the pool.
    const samTasks = tasks.listAgencyTasks(AGENCY).filter(task => task.assigneeUserId === "user_sam");
    assert.ok(samTasks.length >= 1);
    assert.ok(!samTasks.some(task => ids.includes(task.id)), "work already assigned to staff is not re-offered");
  });

  it("authors a training module, grades its quiz, and gates completion on a pass", async () => {
    const people = await import("../src/server/people");
    const sam = people.listPeopleEmployees(AGENCY).find(employee => employee.userId === "user_sam")!;
    const module = people.savePeopleTrainingModule({
      agencyId: AGENCY, actorUserId: "user_ed", title: "Data safety", passMark: 60, status: "published",
      blocks: [{ id: "b1", type: "heading", text: "Keep data safe" }, { id: "b2", type: "video", url: "https://example.test/v" }],
      quiz: [
        { id: "q1", prompt: "Lock your screen?", options: [{ id: "a", text: "Yes", correct: true }, { id: "b", text: "No", correct: false }] },
        { id: "q2", prompt: "Share passwords?", options: [{ id: "a", text: "Yes", correct: false }, { id: "b", text: "No", correct: true }] },
      ],
    });
    assert.equal(module.status, "published");
    // Invalid blocks/questions are dropped: a 1-option question and a no-correct question don't survive.
    const thin = people.savePeopleTrainingModule({ agencyId: AGENCY, actorUserId: "user_ed", title: "Thin", quiz: [{ id: "x", prompt: "?", options: [{ id: "a", text: "only", correct: true }] }] });
    assert.equal(thin.quiz.length, 0, "a question needs ≥2 options");
    // The staff-facing sanitized module never leaks the answer key.
    const staffView = people.sanitizeModuleForStaff(module);
    assert.ok(!JSON.stringify(staffView.quiz).includes("correct"), "sanitized quiz hides which option is correct");
    // Grading.
    assert.equal(people.gradeTrainingQuiz(module, { q1: "a", q2: "b" }).score, 100);
    assert.equal(people.gradeTrainingQuiz(module, { q1: "a", q2: "a" }).score, 50);
    assert.equal(people.gradeTrainingQuiz(module, { q1: "a", q2: "b" }).passed, true);
    assert.equal(people.gradeTrainingQuiz(module, { q1: "b", q2: "a" }).passed, false, "0/2 < 60% pass mark");
    // Assign + complete: a fail leaves it in-progress with a score, a pass completes it.
    const assignment = people.savePeopleTraining({ agencyId: AGENCY, employeeId: sam.id, title: module.title, moduleId: module.id, status: "assigned" });
    const failed = people.completeModuleAssignment({ agencyId: AGENCY, assignmentId: assignment.id, userId: "user_sam", answers: { q1: "a", q2: "a" } });
    assert.equal(failed?.assignment.status, "in-progress");
    assert.equal(failed?.assignment.score, 50);
    const passed = people.completeModuleAssignment({ agencyId: AGENCY, assignmentId: assignment.id, userId: "user_sam", answers: { q1: "a", q2: "b" } });
    assert.equal(passed?.assignment.status, "completed");
    assert.ok(passed?.assignment.completedAt);
    // Only the assigned person may complete it.
    assert.equal(people.completeModuleAssignment({ agencyId: AGENCY, assignmentId: assignment.id, userId: "user_stranger", answers: {} }), null);
    const { mutate } = await import("../src/server/storage");
    mutate(state => { delete state.peopleTrainingAssignments[assignment.id]; for (const id of Object.keys(state.peopleTrainingModules)) if (state.peopleTrainingModules[id].agencyId === AGENCY) delete state.peopleTrainingModules[id]; });
  });

  it("runs the internal chat: team + direct channels, membership, and working-today", async () => {
    const people = await import("../src/server/people");
    const team = people.ensureTeamChannel(AGENCY);
    assert.equal(team.kind, "team");
    assert.equal(people.ensureTeamChannel(AGENCY).id, team.id, "the team channel is a singleton");
    // Anyone on the team can post to the team channel.
    const msg = people.postPeopleMessage({ agencyId: AGENCY, channelId: team.id, authorUserId: "user_sam", body: "Morning all" });
    assert.equal(msg.authorName, "Sam Staff");
    assert.equal(people.listPeopleMessages(AGENCY, team.id).at(-1)?.body, "Morning all");
    assert.throws(() => people.postPeopleMessage({ agencyId: AGENCY, channelId: team.id, authorUserId: "user_ed", body: "   " }), /message/i, "empty message rejected");
    // A direct channel is a deduped 1:1; a non-member can't post to it.
    const direct = people.ensureDirectChannel(AGENCY, "user_ed", "user_sam");
    assert.equal(direct.kind, "direct");
    assert.equal(people.ensureDirectChannel(AGENCY, "user_sam", "user_ed").id, direct.id, "direct channel is order-independent + deduped");
    assert.throws(() => people.postPeopleMessage({ agencyId: AGENCY, channelId: direct.id, authorUserId: "user_stranger", body: "hi" }), /member/i, "non-members can't post to a direct");
    const samChannels = people.listPeopleChannels(AGENCY, "user_sam");
    assert.ok(samChannels.some(channel => channel.id === direct.id), "Sam sees the direct channel");
    // Sam has a session today (from setup: sess_2 date 2026-08-19); NOW is that day.
    assert.ok(people.workingTodayUserIds(AGENCY, NOW).includes("user_sam"), "Sam is working today");
    const snap = people.teamChatSnapshot(AGENCY, "user_ed", team.id, NOW);
    assert.equal(snap.activeChannelId, team.id);
    assert.ok(snap.roster.some(entry => entry.userId === "user_sam" && entry.workingToday), "roster flags who's working today");
    // Clean up chat state for other tests.
    const { mutate } = await import("../src/server/storage");
    mutate(state => {
      for (const id of Object.keys(state.peopleChannels)) if (state.peopleChannels[id].agencyId === AGENCY) delete state.peopleChannels[id];
      for (const id of Object.keys(state.peopleMessages)) if (state.peopleMessages[id].agencyId === AGENCY) delete state.peopleMessages[id];
    });
  });

  it("runs a staff contract through draft → sent → acknowledged and gates the sign-off", async () => {
    const people = await import("../src/server/people");
    const sam = people.listPeopleEmployees(AGENCY).find(employee => employee.userId === "user_sam")!;
    const draft = people.createPeopleContract({ agencyId: AGENCY, actorUserId: "user_ed", employeeId: sam.id, kind: "employment", title: "Employment terms", body: "The full terms of employment…" });
    assert.equal(draft.status, "draft");
    assert.equal(draft.kind, "employment");
    // Can't sign a draft (not sent yet), and a stranger can't sign.
    assert.throws(() => people.acknowledgePeopleContract({ agencyId: AGENCY, contractId: draft.id, userId: "user_sam", name: "Sam" }), /not awaiting/i);
    const sent = people.sendPeopleContract(AGENCY, draft.id, "user_ed");
    assert.equal(sent?.status, "sent");
    assert.equal(people.acknowledgePeopleContract({ agencyId: AGENCY, contractId: draft.id, userId: "user_stranger", name: "Nope" }), null, "only the contract's employee may sign");
    const signed = people.acknowledgePeopleContract({ agencyId: AGENCY, contractId: draft.id, userId: "user_sam", name: "Samuel Staff" });
    assert.equal(signed?.status, "acknowledged");
    assert.equal(signed?.acknowledgementName, "Samuel Staff");
    assert.ok(signed?.acknowledgedAt);
    assert.equal(people.staffCard(AGENCY, sam.id, NOW)!.contracts.some(contract => contract.id === draft.id), true, "contract travels on the card");
    assert.throws(() => people.sendPeopleContract(AGENCY, people.createPeopleContract({ agencyId: AGENCY, actorUserId: "user_ed", employeeId: sam.id, title: "No body" }).id, "user_ed"), /body/i, "can't send an empty contract");
    // Clean up so contract counts don't leak into other tests.
    const { mutate } = await import("../src/server/storage");
    mutate(state => { for (const id of Object.keys(state.peopleContracts)) if (state.peopleContracts[id].agencyId === AGENCY) delete state.peopleContracts[id]; });
  });

  it("configures onboarding + hiring processes and seeds new hires from the template", async () => {
    const people = await import("../src/server/people");
    // Defaults present before any config.
    const before = people.getPeopleProcessConfig(AGENCY);
    assert.ok(before.onboardingSteps.length >= 7, "default onboarding steps");
    assert.equal(before.hiringStages.length, 9, "all fixed hiring stages present");
    assert.equal(before.hiringStages.find(stage => stage.id === "applied")?.label, "Applied");

    // Ed's own onboarding template + hiring labels.
    people.savePeopleOnboardingTemplate(AGENCY, [
      { label: "Sign the welcome pack", owner: "employee" },
      { label: "Set up their machine", owner: "company", detail: "Laptop + logins" },
    ], "user_ed");
    people.savePeopleHiringStages(AGENCY, [{ id: "applied", label: "New lead", guidance: "Reply within a day" }], "user_ed");
    const after = people.getPeopleProcessConfig(AGENCY);
    assert.equal(after.onboardingSteps.length, 2, "template replaced with Ed's steps");
    assert.equal(after.hiringStages.find(stage => stage.id === "applied")?.label, "New lead", "stage relabelled");
    assert.equal(after.hiringStages.find(stage => stage.id === "applied")?.guidance, "Reply within a day");
    assert.equal(after.hiringStages.length, 9, "fixed stage ids stay intact for Radar");
    assert.equal(after.hiringStages.find(stage => stage.id === "interview")?.label, "Interview", "untouched stages keep defaults");

    // A NEW hire seeds onboarding from the configured template; existing employees are untouched.
    const hire = people.createPeopleEmployee({ agencyId: AGENCY, actorUserId: "user_ed", name: "New Hire", email: "new@staff.test", title: "Analyst", employmentType: "full-time" });
    assert.equal(hire.onboardingItems.length, 2, "new hire uses the configured template");
    assert.equal(hire.onboardingItems[0].label, "Sign the welcome pack");
    assert.throws(() => people.savePeopleOnboardingTemplate(AGENCY, [], "user_ed"), /at least one/i, "template can't be emptied");
    const { mutate } = await import("../src/server/storage");
    mutate(state => { delete state.peopleEmployees[hire.id]; delete state.peopleProcessConfig[AGENCY]; });
  });

  it("carries upward feedback from a staff member to the owner", async () => {
    const people = await import("../src/server/people");
    const sam = people.listPeopleEmployees(AGENCY).find(employee => employee.userId === "user_sam");
    assert.ok(sam);
    const fb = people.createPeopleFeedback({ agencyId: AGENCY, employeeId: sam!.id, message: "Could we get faster laptops?", sentiment: "idea" });
    assert.equal(fb.status, "new");
    assert.equal(fb.sentiment, "idea");
    assert.throws(() => people.createPeopleFeedback({ agencyId: AGENCY, employeeId: sam!.id, message: "x" }), /more/i, "needs a real message");
    assert.throws(() => people.createPeopleFeedback({ agencyId: AGENCY, employeeId: "ghost", message: "hello there" }), /not found/i);
    assert.equal(people.staffCard(AGENCY, sam!.id, NOW)!.feedback.some(item => item.id === fb.id), true, "feedback travels on the owner's card");
    const actioned = people.setPeopleFeedbackStatus(AGENCY, fb.id, "actioned");
    assert.equal(actioned?.status, "actioned");
    assert.equal(people.setPeopleFeedbackStatus(AGENCY, "nope", "read"), null, "unknown feedback → null");
  });

  it("persists an owner-set growth path onto the employee", async () => {
    const people = await import("../src/server/people");
    const sam = people.listPeopleEmployees(AGENCY).find(employee => employee.userId === "user_sam");
    const updated = people.updatePeopleEmployee(AGENCY, sam!.id, { targetRole: "Lead Designer", growthPathNote: "Own the design system, mentor one junior." }, "user_ed");
    assert.equal(updated?.targetRole, "Lead Designer");
    assert.equal(updated?.growthPathNote, "Own the design system, mentor one junior.");
    assert.ok(people.PEOPLE_STATIONS.some(station => station.id === "progression"), "progression station exists");
  });

  it("builds the org chart from the reporting edge with the owner on top", async () => {
    const people = await import("../src/server/people");
    // Owner has a real record here (added earlier in "does not double-list"? that was deleted). Re-add owner record so the tree has a real top.
    const owner = people.createPeopleEmployee({ agencyId: AGENCY, actorUserId: "user_ed", userId: "user_ed", name: "Ed Owner", email: "ed@staff.test", title: "Founder", employmentType: "full-time" });
    const sam = people.listPeopleEmployees(AGENCY).find(employee => employee.userId === "user_sam")!;
    const junior = people.createPeopleEmployee({ agencyId: AGENCY, actorUserId: "user_ed", name: "Jo Junior", email: "jo@staff.test", title: "Junior Designer", employmentType: "full-time" });
    // Jo reports to Sam; Sam has no manager → reports to the owner implicitly.
    people.updatePeopleEmployee(AGENCY, junior.id, { managerEmployeeId: sam.id }, "user_ed");

    const chart = people.staffOrgChart(AGENCY, NOW);
    assert.equal(chart.owner?.entry.isOwner, true, "owner anchors the tree");
    assert.equal(chart.owner?.entry.employeeId, owner.id);
    const samNode = chart.owner!.reports.find(node => node.entry.employeeId === sam.id);
    assert.ok(samNode, "Sam hangs off the owner (no explicit manager)");
    assert.equal(samNode!.reports[0]?.entry.employeeId, junior.id, "Jo reports to Sam");
    // Fran (freelancer, created earlier) is a distinct layer, not in the line tree.
    assert.ok(chart.freelancers.some(entry => entry.title === "Illustrator"), "freelancers are their own layer");
    assert.ok(!chart.owner!.reports.some(node => chart.freelancers.some(f => f.id === node.entry.id)), "freelancers aren't in the reporting tree");

    // A manager cycle never recurses and surfaces as unplaced.
    people.updatePeopleEmployee(AGENCY, sam.id, { managerEmployeeId: junior.id }, "user_ed"); // Sam→Jo, Jo→Sam
    const cyclic = people.staffOrgChart(AGENCY, NOW);
    assert.ok(cyclic.unplaced.some(entry => entry.employeeId === sam.id) || cyclic.unplaced.some(entry => entry.employeeId === junior.id), "a manager loop lands in unplaced, not an infinite tree");
    // Clean up the cycle so later tests are unaffected.
    people.updatePeopleEmployee(AGENCY, sam.id, { managerEmployeeId: undefined }, "user_ed");
    const { mutate } = await import("../src/server/storage");
    mutate(state => { delete state.peopleEmployees[owner.id]; delete state.peopleEmployees[junior.id]; });
  });

  it("shapes the Radar team domain into capacity buckets", async () => {
    const { shapeStaffCapacity } = await import("../src/server/staffCapacity");
    const check = (familyId: string, status: string, familyLabel = familyId) => ({
      id: `chk_${familyId}`, ruleId: familyId, domain: "team", familyId, familyLabel,
      lens: "signal", lensLabel: "Signal", scope: "agency", status,
      title: `${familyLabel} title`, detail: `${familyLabel} detail`, evidence: [`${familyId} evidence`],
      href: `/portal/agency/people?family=${familyId}`, sourceId: familyId, measuredAt: NOW,
    });
    const checks = [
      check("capacity-growth", "warning"),
      check("capacity-delivery", "critical"),
      check("hiring-trigger", "warning"),
      check("candidate-backlog", "watch"),
      check("team-size", "pass"),
      check("workload-balance", "critical"),
      check("training-overdue", "pass"),
    ];
    const domain = { domain: "team", totalChecks: 7, passedChecks: 2, firingChecks: 3, watchChecks: 1, blindChecks: 0, coveragePercent: 71, confidencePercent: 60, readinessPercent: 55 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = shapeStaffCapacity(checks as any, domain as any);
    assert.equal(snapshot.available, true);
    assert.equal(snapshot.health?.readinessPercent, 55);
    assert.deepEqual(snapshot.areas.map(a => a.area), ["delivery", "growth"], "areas sorted critical-first");
    assert.deepEqual(snapshot.hiring.map(s => s.familyId).sort(), ["candidate-backlog", "hiring-trigger"]);
    assert.deepEqual(snapshot.coverage.map(s => s.familyId).sort(), ["team-size", "workload-balance"]);
    assert.equal(snapshot.attention[0].status, "critical", "most-severe firing check leads the attention list");
    assert.ok(!snapshot.attention.some(s => s.status === "pass"), "passing checks are not 'attention'");
  });

  it("derives presence from heartbeat freshness, not just an open session", async () => {
    const { mutate } = await import("../src/server/storage");
    const people = await import("../src/server/people");
    // A staff member whose presence we drive by rewriting one open session's
    // heartbeat. Reuse Sam's user; clear his sessions first so only the probe counts.
    const sam = people.listPeopleEmployees(AGENCY).find(employee => employee.userId === "user_sam");
    assert.ok(sam);
    const probe = (quietMs: number, open: boolean) => {
      mutate(state => {
        for (const id of Object.keys(state.dashboardWorkSessions)) if (state.dashboardWorkSessions[id].userId === "user_sam") delete state.dashboardWorkSessions[id];
        const seen = NOW - quietMs;
        state.dashboardWorkSessions.probe = { id: "probe", agencyId: AGENCY, userId: "user_sam", date: "2026-08-19", startedAt: seen, endedAt: open ? undefined : seen, lastHeartbeatAt: seen, lastInteractionAt: seen, lastVisibleAt: seen, createdAt: seen, updatedAt: seen };
      });
      return people.staffCard(AGENCY, sam!.id, NOW)!.entry.presence;
    };
    assert.equal(probe(60_000, true).state, "online", "open + heartbeat 1min ago → online");
    assert.equal(probe(12 * 60_000, true).state, "idle", "open + heartbeat 12min ago → idle (clocked in, quiet)");
    assert.equal(probe(90 * 60_000, true).state, "offline", "open but heartbeat 90min ago → offline (abandoned session)");
    const ended = probe(2 * 60_000, false);
    assert.equal(ended.state, "offline", "an ended session is never online");
    assert.equal(ended.lastSeenAt, NOW - 2 * 60_000, "offline still reports a last-seen");
  });
});
