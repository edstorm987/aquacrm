import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  PENDING_CONNECTION_TTL_MS, canCompleteConnection, completeConnection,
  connectionUrl, createPortalConnection, newConnectionId, refusalMessage,
  revokePortalConnection, type PortalConnection,
} from "../src/lib/server/portal/portalConnections.ts";

const NOW = 1_000_000_000;
const base = () => createPortalConnection({
  agencyId: "milesymedia", clientId: "cli_1", label: "Cedar booking app",
  createdBy: "ed", now: NOW,
});

describe("creating a connection link", () => {
  it("starts pending and belongs to one client", () => {
    const connection = base();
    assert.equal(connection.status, "pending");
    assert.equal(connection.clientId, "cli_1");
  });

  it("needs a name so connections can be told apart", () => {
    assert.throws(() => createPortalConnection({
      agencyId: "a", clientId: "c", label: "   ", createdBy: "ed",
    }));
  });

  it("uses an unguessable id", () => {
    // Not a credential — it grants nothing without authentication — but a
    // guessable id would let somebody watch a connection screen fill in.
    const ids = new Set(Array.from({ length: 50 }, () => newConnectionId()));
    assert.equal(ids.size, 50);
    assert.ok(newConnectionId().length > 24);
  });

  it("builds a link on the portal's own origin", () => {
    assert.equal(connectionUrl("https://aqua-crm.com/", "pcn_abc"), "https://aqua-crm.com/connect/pcn_abc");
  });
});

describe("who may complete a connection", () => {
  const attempt = (connection: PortalConnection | undefined, over: Partial<Parameters<typeof canCompleteConnection>[0]> = {}) =>
    canCompleteConnection({ connection, viewerClientId: "cli_1", viewerUserId: "usr_1", now: NOW, ...over });

  it("allows the client the link was made for", () => {
    assert.equal(attempt(base()).ok, true);
  });

  it("refuses somebody signed in as a different client", () => {
    // The link names a client; the session says who is signed in. A mismatch
    // is somebody else's link, and the safe answer is no.
    const result = attempt(base(), { viewerClientId: "cli_other" });
    assert.equal(result.ok === false && result.reason, "wrong-client");
  });

  it("refuses when nobody is signed in as a client at all", () => {
    const result = attempt(base(), { viewerClientId: undefined });
    assert.equal(result.ok, false);
  });

  it("refuses a link nobody recognises", () => {
    assert.equal(attempt(undefined).ok, false);
  });

  it("refuses a withdrawn connection", () => {
    const revoked = revokePortalConnection(base(), { by: "ed", now: NOW });
    const result = attempt(revoked);
    assert.equal(result.ok === false && result.reason, "revoked");
  });

  it("expires a link that was never used", () => {
    // A link pasted into a document and forgotten should not still be live
    // months later.
    const result = attempt(base(), { now: NOW + PENDING_CONNECTION_TTL_MS + 1 });
    assert.equal(result.ok === false && result.reason, "expired");
  });

  it("reports a stale link as stale rather than as a permissions problem", () => {
    // Otherwise it sends somebody to the wrong person for help.
    const result = attempt(base(), {
      now: NOW + PENDING_CONNECTION_TTL_MS + 1,
      viewerClientId: "cli_other",
    });
    assert.equal(result.ok === false && result.reason, "expired");
  });
});

describe("completing it", () => {
  it("binds the connection to the person who consented", () => {
    const connected = completeConnection(base(), { userId: "usr_1", origin: "https://cedar.app", now: NOW });
    assert.equal(connected.status, "active");
    assert.equal(connected.connectedUserId, "usr_1");
    assert.equal(connected.origin, "https://cedar.app");
  });

  it("never reassigns the connection to somebody else", () => {
    // Inheriting a connection would mean one person's two-factor standing in
    // for another's.
    const first = completeConnection(base(), { userId: "usr_1", now: NOW });
    const second = completeConnection(first, { userId: "usr_2", now: NOW + 1000 });
    assert.equal(second.connectedUserId, "usr_1");
    assert.equal(second.connectedAt, NOW);
  });

  it("lets the same person follow their link again without an error", () => {
    // Already connected is a success, not a dead end — it should land them in
    // the portal.
    const connected = completeConnection(base(), { userId: "usr_1", now: NOW });
    const result = canCompleteConnection({
      connection: connected, viewerClientId: "cli_1", viewerUserId: "usr_1", now: NOW + 5000,
    });
    assert.equal(result.ok, true);
  });

  it("refuses a colleague trying to take over an active connection", () => {
    const connected = completeConnection(base(), { userId: "usr_1", now: NOW });
    const result = canCompleteConnection({
      connection: connected, viewerClientId: "cli_1", viewerUserId: "usr_2", now: NOW + 5000,
    });
    assert.equal(result.ok === false && result.reason, "already-connected");
  });
});

describe("withdrawing it", () => {
  it("keeps the record rather than deleting it", () => {
    // Who connected what, and when it was withdrawn, is exactly the history
    // somebody needs after an incident.
    const revoked = revokePortalConnection(completeConnection(base(), { userId: "usr_1", now: NOW }), { by: "ed", now: NOW + 99 });
    assert.equal(revoked.status, "revoked");
    assert.equal(revoked.revokedBy, "ed");
    assert.equal(revoked.connectedUserId, "usr_1", "the history must survive the revocation");
  });
});

describe("what the screen says", () => {
  it("explains every refusal in plain English with a way forward", () => {
    for (const reason of ["unknown", "revoked", "expired", "wrong-client", "already-connected"] as const) {
      const message = refusalMessage(reason);
      assert.ok(message.length > 20, `${reason} has no real message`);
      assert.doesNotMatch(message, /error|invalid|denied/i, `${reason} reads as a system error`);
    }
  });
});

describe("the stored side", () => {
  let store: typeof import("../src/server/portalConnectionStore");
  let mutate: typeof import("../src/server/storage").mutate;

  before(async () => {
    process.env.PORTAL_BACKEND = "memory";
    const storage = await import("../src/server/storage");
    await storage.ensureHydrated();
    mutate = storage.mutate;
    store = await import("../src/server/portalConnectionStore");
  });

  beforeEach(() => {
    mutate(state => { state.portalConnections = {}; });
  });

  const open = () => store.openPortalConnection({
    agencyId: "milesymedia", clientId: "cli_1", label: "Cedar booking app", createdBy: "ed",
  });

  it("accepts for the right client and records who consented", () => {
    const connection = open();
    const result = store.acceptPortalConnection({
      connectionId: connection.id, viewerClientId: "cli_1", viewerUserId: "usr_1", origin: "https://cedar.app",
    });
    assert.equal(result.ok, true);
    const stored = store.getPortalConnection(connection.id);
    assert.equal(stored?.status, "active");
    assert.equal(stored?.connectedUserId, "usr_1");
    assert.equal(stored?.origin, "https://cedar.app");
  });

  it("re-checks the rules against stored state, not the caller's word", () => {
    // A revocation landing between the page rendering and the button being
    // pressed must still take effect.
    const connection = open();
    store.withdrawPortalConnection({ agencyId: "milesymedia", connectionId: connection.id, by: "ed" });
    const result = store.acceptPortalConnection({
      connectionId: connection.id, viewerClientId: "cli_1", viewerUserId: "usr_1",
    });
    assert.equal(result.ok === false && result.reason, "revoked");
  });

  it("refuses a client accepting somebody else's connection", () => {
    const connection = open();
    const result = store.acceptPortalConnection({
      connectionId: connection.id, viewerClientId: "cli_other", viewerUserId: "usr_9",
    });
    assert.equal(result.ok === false && result.reason, "wrong-client");
    assert.equal(store.getPortalConnection(connection.id)?.status, "pending", "nothing may be written on a refusal");
  });

  it("will not let one agency withdraw another's connection", () => {
    const connection = open();
    assert.equal(store.withdrawPortalConnection({ agencyId: "someone-else", connectionId: connection.id, by: "them" }), null);
    assert.equal(store.getPortalConnection(connection.id)?.status, "pending");
  });

  it("only records a heartbeat for an active connection", () => {
    // A revoked connection still reporting is a fact worth noticing, not one
    // to quietly refresh.
    const connection = open();
    store.markPortalConnectionSeen(connection.id, 5_000);
    assert.equal(store.getPortalConnection(connection.id)?.lastSeenAt, undefined);
    store.acceptPortalConnection({ connectionId: connection.id, viewerClientId: "cli_1", viewerUserId: "usr_1" });
    store.markPortalConnectionSeen(connection.id, 9_000);
    assert.equal(store.getPortalConnection(connection.id)?.lastSeenAt, 9_000);
  });

  it("lists an agency's connections and nobody else's", () => {
    open();
    store.openPortalConnection({ agencyId: "other", clientId: "cli_x", label: "Theirs", createdBy: "them" });
    assert.equal(store.listPortalConnections("milesymedia").length, 1);
  });
});

describe("where the link points", () => {
  const ENV_KEY = "NEXT_PUBLIC_PORTAL_BASE_URL";
  let saved: string | undefined;

  before(async () => { saved = process.env[ENV_KEY]; });

  const linkOrigin = async (): Promise<(requestOrigin?: string) => string> =>
    (await import("../src/lib/server/portal/portalConnections.ts")).connectionLinkOrigin;

  it("prefers the public address over the host the request arrived on", async () => {
    // The link is for the client, not for whoever generated it. One reading
    // `localhost:3032` because Ed made it on his own machine is a link the
    // client cannot open.
    process.env[ENV_KEY] = "https://aqua-crm.com";
    assert.equal((await linkOrigin())("http://localhost:3032"), "https://aqua-crm.com");
  });

  it("falls back to the request origin when no public address is configured", async () => {
    delete process.env[ENV_KEY];
    assert.equal((await linkOrigin())("https://staging.example.com"), "https://staging.example.com");
  });

  it("still produces a usable local link with neither", async () => {
    delete process.env[ENV_KEY];
    assert.equal(connectionUrl((await linkOrigin())(), "pcn_x"), "http://localhost:3032/connect/pcn_x");
    if (saved !== undefined) process.env[ENV_KEY] = saved;
  });
});

describe("what the connection screen is given", () => {
  let store: typeof import("../src/server/portalConnectionStore");
  let mutate: typeof import("../src/server/storage").mutate;

  before(async () => {
    process.env.PORTAL_BACKEND = "memory";
    const storage = await import("../src/server/storage");
    await storage.ensureHydrated();
    mutate = storage.mutate;
    store = await import("../src/server/portalConnectionStore");
  });

  beforeEach(() => {
    mutate(state => { state.portalConnections = {}; });
  });

  const open = () => store.openPortalConnection({
    agencyId: "milesymedia", clientId: "cli_1", label: "Cedar booking app", createdBy: "ed",
  });

  it("carries the link, so the screen never has to build one", () => {
    const view = store.describePortalConnection(open(), "https://aqua-crm.com");
    assert.match(view.url, /^https:\/\/aqua-crm\.com\/connect\/pcn_/);
  });

  it("says when an unused link stops working", () => {
    // A link sent three weeks ago that nobody used looks exactly like one sent
    // yesterday unless something says so.
    const connection = open();
    const view = store.describePortalConnection(connection, "https://aqua-crm.com");
    assert.equal(view.expiresAt, connection.createdAt + PENDING_CONNECTION_TTL_MS);
  });

  it("drops the expiry once the link has been used", () => {
    const connection = open();
    store.acceptPortalConnection({
      connectionId: connection.id, viewerClientId: "cli_1", viewerUserId: "usr_1",
    });
    const view = store.describePortalConnection(store.getPortalConnection(connection.id)!, "https://aqua-crm.com");
    assert.equal(view.expiresAt, undefined, "an active connection cannot expire");
  });

  it("names whoever consented rather than leaving an id nobody can read", () => {
    const connection = open();
    mutate(state => {
      state.users["usr_1"] = {
        id: "usr_1", email: "owner@cedar.example", role: "client-admin", agencyId: "milesymedia",
      } as (typeof state.users)[string];
    });
    store.acceptPortalConnection({
      connectionId: connection.id, viewerClientId: "cli_1", viewerUserId: "usr_1",
    });
    const view = store.describePortalConnection(store.getPortalConnection(connection.id)!, "https://aqua-crm.com");
    assert.equal(view.connectedUserEmail, "owner@cedar.example");
  });
});

describe("the agency side of the flow", () => {
  const read = (...p: string[]) => require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", ...p), "utf-8") as string;
  // Explanatory comments quote the very things these tests look for, so they
  // are stripped before matching.
  const source = (...p: string[]) => read(...p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  const route = () => source("src", "app", "api", "portal", "connections", "route.ts");
  const screen = () => source("src", "app", "portal", "clients", "[clientId]", "_ClientPortalConnections.tsx");

  it("is agency-only", () => {
    assert.match(route(), /requireRole\(\[\.\.\.AGENCY_ROLES\]\)/);
  });

  it("never takes the agency from the caller", () => {
    // Otherwise a connection could be opened against somebody else's client by
    // sending their id.
    assert.doesNotMatch(route(), /body[?.]*\.agencyId/);
    assert.match(route(), /agencyId: session\.agencyId/);
  });

  it("reads the client through the agency before opening anything", () => {
    const source_ = route();
    const lookupAt = source_.indexOf("getClientForAgency(session.agencyId");
    const openAt = source_.indexOf("openPortalConnection({");
    assert.ok(lookupAt > 0, "the client is never checked");
    assert.ok(lookupAt < openAt, "a connection is opened before the client is known");
  });

  it("records opening and withdrawing, so the history survives the connection", () => {
    assert.match(route(), /portal_connection\.opened/);
    assert.match(route(), /portal_connection\.withdrawn/);
  });

  it("passes the rules module's own refusal through rather than a generic message", () => {
    // "A connection needs a name so it can be told from the others" is more
    // use than "Bad request".
    assert.match(route(), /error instanceof Error \? error\.message/);
  });

  it("offers a name rather than an empty box", () => {
    // Aqua usually knows what the client runs; a guess Ed corrects beats a box
    // he has to think about.
    assert.match(screen(), /useState\(suggestions\[0\]/);
  });

  it("copies the link as soon as it exists", () => {
    // The reason for making a link is to send it; the extra click was only a
    // chance to forget.
    const source_ = screen();
    const createAt = source_.indexOf("setConnections(current => [payload.connection!");
    const copyAt = source_.indexOf("await copy(payload.connection");
    assert.ok(copyAt > createAt, "the new link is not copied");
  });

  it("does not report a failed automatic copy as an error", () => {
    // The link is on screen with a button beside it. A red message under a
    // link that worked reads as a failure that did not happen.
    assert.match(screen(), /await copy\(payload\.connection, \{ quiet: true \}\)/);
    assert.match(screen(), /if \(!options\.quiet\) setError/);
  });

  it("leaves a way to copy when the clipboard is blocked", () => {
    // Clipboard access is refused outside a secure context, and a dead end
    // there is a link that cannot be sent at all.
    assert.match(screen(), /readOnly/);
    assert.match(screen(), /value=\{connection\.url\}/);
  });

  it("keeps withdrawn connections on the screen", () => {
    assert.match(screen(), /withdrawn\.length/);
  });

  it("does not offer reset on a live connection, only disconnect", () => {
    // Reset on an active link would silently revoke a working connection and
    // force the customer to consent again — that is what Disconnect is for.
    assert.match(screen(), /\{!active \? \(/);
  });

  it("does not claim a heartbeat it has not had", () => {
    // `lastSeenAt` is set at consent, so until the Aqua Tag reports it is just
    // the moment of connection wearing a different name.
    assert.match(screen(), /lastSeenAt - connection\.connectedAt > 60_000/);
  });

  it("says an expired link has stopped working and offers a new one", () => {
    // This fails at the client's end, where Ed never sees it.
    assert.match(screen(), /link expired/);
    assert.match(screen(), /New link/);
  });
});

describe("confirming it is really them", () => {
  let mod: typeof import("../src/lib/server/connectionConfirmation");
  let DEV_CODE: string;

  const CID = "pcn_confirm_test";
  const UID = "usr_1";

  // A stored code as the connection record would hold it: the hash of a real
  // code for this connection + user, unexpired unless told otherwise.
  const storedFor = (code: string, over: Partial<import("../src/lib/server/connectionConfirmation").PendingConfirmationCode> = {}) => ({
    hash: mod.hashConfirmationCode({ connectionId: CID, userId: UID, code }),
    expiresAt: 2_000_000_000_000,
    attempts: 0,
    ...over,
  });

  const check = (over: Partial<Parameters<typeof mod.checkConfirmationCode>[0]> = {}) =>
    mod.checkConfirmationCode({
      code: undefined, bypassEnabled: false, connectionId: CID, userId: UID, stored: undefined, ...over,
    });

  before(async () => {
    mod = await import("../src/lib/server/connectionConfirmation.ts");
    DEV_CODE = mod.DEV_CONFIRMATION_CODE;
  });

  it("asks for a code before anything is bound to somebody's name", () => {
    assert.equal(check({ code: undefined, bypassEnabled: true }).status, "code-required");
    assert.equal(check({ code: "  ", bypassEnabled: true }).status, "code-required");
  });

  it("accepts a real emailed code, for the person it was sent to", () => {
    const code = "482913";
    assert.equal(check({ code, stored: storedFor(code) }).status, "confirmed");
  });

  it("binds a code to the one user — a colleague's session cannot use it", () => {
    // The user id is mixed into the hash, so a code sent to one person does not
    // confirm another's session even on the same connection.
    const code = "482913";
    const stored = storedFor(code);
    assert.equal(
      mod.checkConfirmationCode({ code, bypassEnabled: false, connectionId: CID, userId: "usr_2", stored }).status,
      "wrong-code",
    );
  });

  it("binds a code to the one connection", () => {
    const code = "482913";
    const stored = storedFor(code);
    assert.equal(
      mod.checkConfirmationCode({ code, bypassEnabled: false, connectionId: "pcn_other", userId: UID, stored }).status,
      "wrong-code",
    );
  });

  it("refuses a wrong code without saying which kind of wrong", () => {
    // "Expired" or "never sent" would narrow the guess for somebody trying codes.
    const result = check({ code: "000001", stored: storedFor("482913") });
    assert.equal(result.status, "wrong-code");
    assert.doesNotMatch(result.status === "wrong-code" ? result.message : "", /expired|never sent|not sent/i);
  });

  it("reports an expired code as expired, so a fresh one can be offered", () => {
    // Distinct from a wrong guess: expiry is not a guessing oracle — knowing a
    // code lapsed does not narrow the next guess — and it lets the screen offer
    // a resend rather than a dead retry.
    const code = "482913";
    const result = check({ code, stored: storedFor(code, { expiresAt: 1_000 }), now: 2_000 });
    assert.equal(result.status, "expired");
  });

  it("forgives how people type a code out of an email", () => {
    const code = "482913";
    assert.equal(check({ code: " 48-29 13 ", stored: storedFor(code) }).status, "confirmed");
  });

  it("accepts the dev stand-in only where the bypass is allowed", () => {
    assert.equal(check({ code: DEV_CODE, bypassEnabled: true }).status, "confirmed");
    // Bypass off, no real code issued → an ordinary wrong guess, not a magic pass.
    assert.equal(check({ code: DEV_CODE, bypassEnabled: false }).status, "wrong-code");
  });

  it("never lets the dev stand-in override a real issued code with the bypass off", () => {
    // In production the stand-in is just another wrong string.
    const stored = storedFor("482913");
    assert.equal(check({ code: DEV_CODE, bypassEnabled: false, stored }).status, "wrong-code");
  });

  it("locks a code after too many wrong guesses — even the right one then fails", () => {
    // Guessing to the limit and then trying the real code must not work; the
    // only way on is a fresh code.
    const code = "482913";
    const maxed = storedFor(code, { attempts: mod.MAX_CODE_ATTEMPTS });
    assert.equal(check({ code: "000001", stored: maxed }).status, "locked");
    assert.equal(check({ code, stored: maxed }).status, "locked");
  });

  it("lets the dev bypass through even when a code is locked", () => {
    // The bypass is for walking the flow; locking it out would defeat that.
    const maxed = storedFor("482913", { attempts: mod.MAX_CODE_ATTEMPTS });
    assert.equal(check({ code: DEV_CODE, bypassEnabled: true, stored: maxed }).status, "confirmed");
  });

  it("mints uniformly-wide numeric codes", () => {
    const codes = Array.from({ length: 200 }, () => mod.generateConfirmationCode());
    const shape = new RegExp(`^\\d{${mod.CONFIRMATION_CODE_LENGTH}}$`);
    for (const code of codes) assert.match(code, shape, `${code} is not ${mod.CONFIRMATION_CODE_LENGTH} digits`);
    assert.ok(new Set(codes).size > 150, "codes are barely random");
  });

  it("stores only a hash of the code, deterministically", () => {
    // The raw code is emailed and never kept; only this hash is at rest.
    const code = "482913";
    const hash = mod.hashConfirmationCode({ connectionId: CID, userId: UID, code });
    assert.doesNotMatch(hash, /482913/);
    assert.equal(hash, mod.hashConfirmationCode({ connectionId: CID, userId: UID, code }), "hash is not deterministic");
  });
});

describe("issuing and spending an emailed connection code", () => {
  let store: typeof import("../src/server/portalConnectionStore");
  let confirmation: typeof import("../src/lib/server/connectionConfirmation");
  let mutate: typeof import("../src/server/storage").mutate;

  before(async () => {
    process.env.PORTAL_BACKEND = "memory";
    const storage = await import("../src/server/storage");
    await storage.ensureHydrated();
    mutate = storage.mutate;
    store = await import("../src/server/portalConnectionStore");
    confirmation = await import("../src/lib/server/connectionConfirmation.ts");
  });

  beforeEach(() => {
    mutate(state => { state.portalConnections = {}; });
  });

  const open = () => store.openPortalConnection({
    agencyId: "milesymedia", clientId: "cli_1", label: "Cedar booking app", createdBy: "ed",
  });

  it("mints a six-digit code for the right client and stores only its hash", () => {
    const connection = open();
    const issued = store.issuePortalConnectionCode({
      connectionId: connection.id, viewerClientId: "cli_1", viewerUserId: "usr_1",
    });
    assert.equal(issued.ok, true);
    assert.match(issued.ok ? issued.code : "", /^\d{6}$/);
    const stored = store.getPortalConnection(connection.id);
    assert.ok(stored?.pendingCode, "no code was stored");
    // The stored hash is of the plaintext, for this connection + user — and is
    // not the plaintext itself.
    assert.doesNotMatch(stored!.pendingCode!.hash, new RegExp(issued.ok ? issued.code : "x"));
    assert.equal(
      stored!.pendingCode!.hash,
      confirmation.hashConfirmationCode({ connectionId: connection.id, userId: "usr_1", code: issued.ok ? issued.code : "" }),
    );
  });

  it("refuses to issue a code for somebody else's connection", () => {
    const connection = open();
    const issued = store.issuePortalConnectionCode({
      connectionId: connection.id, viewerClientId: "cli_other", viewerUserId: "usr_9",
    });
    assert.equal(issued.ok === false && issued.reason, "wrong-client");
    assert.equal(store.getPortalConnection(connection.id)?.pendingCode, undefined, "nothing may be stored on a refusal");
  });

  it("clears the code the instant the connection completes, so it cannot be replayed", () => {
    const connection = open();
    store.issuePortalConnectionCode({ connectionId: connection.id, viewerClientId: "cli_1", viewerUserId: "usr_1" });
    assert.ok(store.getPortalConnection(connection.id)?.pendingCode, "a code should be pending before accept");
    store.acceptPortalConnection({ connectionId: connection.id, viewerClientId: "cli_1", viewerUserId: "usr_1" });
    const done = store.getPortalConnection(connection.id);
    assert.equal(done?.status, "active");
    assert.equal(done?.pendingCode, undefined, "the code must be spent once used");
  });

  it("counts wrong guesses so brute force can be locked out", () => {
    const connection = open();
    store.issuePortalConnectionCode({ connectionId: connection.id, viewerClientId: "cli_1", viewerUserId: "usr_1" });
    assert.equal(store.recordPortalConnectionCodeAttempt(connection.id), 1);
    assert.equal(store.recordPortalConnectionCodeAttempt(connection.id), 2);
    assert.equal(store.getPortalConnection(connection.id)?.pendingCode?.attempts, 2);
  });

  it("a resend replaces the earlier code rather than leaving two live", () => {
    const connection = open();
    const first = store.issuePortalConnectionCode({ connectionId: connection.id, viewerClientId: "cli_1", viewerUserId: "usr_1" });
    const second = store.issuePortalConnectionCode({ connectionId: connection.id, viewerClientId: "cli_1", viewerUserId: "usr_1" });
    const stored = store.getPortalConnection(connection.id);
    assert.equal(
      stored!.pendingCode!.hash,
      confirmation.hashConfirmationCode({ connectionId: connection.id, userId: "usr_1", code: second.ok ? second.code : "" }),
      "the newest code must be the one that verifies",
    );
    assert.notEqual(
      stored!.pendingCode!.hash,
      confirmation.hashConfirmationCode({ connectionId: connection.id, userId: "usr_1", code: first.ok ? first.code : "" }),
      "the superseded code must no longer verify",
    );
  });

  it("will not issue against a link that is already connected", () => {
    const connection = open();
    store.acceptPortalConnection({ connectionId: connection.id, viewerClientId: "cli_1", viewerUserId: "usr_1" });
    const issued = store.issuePortalConnectionCode({ connectionId: connection.id, viewerClientId: "cli_1", viewerUserId: "usr_1" });
    assert.equal(issued.ok, false);
  });
});

describe("arriving from the client's own software", () => {
  const read = (...p: string[]) => require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", ...p), "utf-8") as string;
  const page = () => read("src", "app", "connect", "[connectionId]", "page.tsx")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const flow = () => read("src", "app", "connect", "[connectionId]", "_ConnectFlow.tsx");

  it("greets somebody signed out rather than bouncing them to the login page", () => {
    // They may never have seen Aqua, and being thrown to a login page by a
    // product you were sent to by another one reads as an error. The greeting
    // and the sign-in are the same screen.
    assert.match(flow(), /title=\{`Welcome, \$\{accountName\}`\}/);
    assert.doesNotMatch(page(), /redirect\(`\/login/);
  });

  it("checks the link is alive before asking anybody to sign in", () => {
    // Sending somebody through a login form only to tell them the link was
    // dead all along wastes the one bit of effort they were willing to spend.
    const source = page();
    const checkAt = source.indexOf("isStillOpen(connection)");
    const sessionGateAt = source.indexOf("if (!session)");
    assert.ok(checkAt > 0, "the link is never checked before sign-in");
    assert.ok(checkAt < sessionGateAt, "somebody is sent to sign in before the link is checked");
  });

  it("signs in on the connection screen rather than sending them away", () => {
    // Leaving the page mid-way and coming back is what made this feel like
    // several errands instead of one.
    assert.match(flow(), /fetch\("\/api\/auth\/login"/);
    assert.match(flow(), /Sign in and continue/);
  });

  it("names only stages that really happen", () => {
    // A progress list naming things which are not happening is a lie told
    // slowly, and would be the one dishonest thing in the flow.
    const stages = flow().slice(flow().indexOf("const STAGES"), flow().indexOf("] as const"));
    assert.match(stages, /Confirming your code/);
    assert.match(stages, /Opening your portal/);
    assert.doesNotMatch(stages, /Encrypting|Verifying identity|Scanning/);
  });

  it("never tells somebody their own agency's link belongs to a stranger", () => {
    // Superseded the "This is your own link" wall (18 Aug 2026): Ed does the
    // setup, so intercepting him was intercepting the normal case. The
    // requirement it protected still holds — nobody signed in on the wrong
    // account is turned away — it is now met by showing the sign-in screen.
    const source = page();
    assert.match(source, /const onTheAccount = session\.clientId === openable\.connection\.clientId/);
    const wrongAccountBlock = source.slice(source.indexOf("if (!onTheAccount)"), source.indexOf("const attempt ="));
    assert.match(wrongAccountBlock, /<ConnectFlow/, "somebody on the wrong account is not offered a way forward");
    assert.doesNotMatch(wrongAccountBlock, /Refused/, "they are turned away instead of signed in");
  });

  it("still will not complete it for somebody on the wrong account", () => {
    // Showing them the sign-in is a way forward, not a permission. Binding the
    // connection to an agency session would bind it to the wrong person.
    const source = page();
    const wrongAccountBlock = source.slice(source.indexOf("if (!onTheAccount)"), source.indexOf("const attempt ="));
    assert.ok(wrongAccountBlock.length > 100, "the wrong-account block was not found");
    assert.match(wrongAccountBlock, /signedIn=\{false\}/, "they are treated as already signed in");
    // And the real gate is still there, downstream, reading stored state.
    assert.match(source, /canCompleteConnection\(\{/);
  });

  it("offers the customer walkthrough only in dev", () => {
    const source = page();
    assert.match(source, /const devMode = isDevModeEnabled\(\)/);
    assert.match(source, /previewHref = devMode/);
  });

  it("greets somebody by the account name", () => {
    // Deliberate, and a reversal: the greeting used to withhold the business
    // name from anybody not yet signed in. Ed asked for "welcome, name" — the
    // link was sent to somebody who already knows whose account it is, and a
    // nameless greeting reads as a form rather than a welcome.
    const source = page();
    const signedOutBlock = source.slice(source.indexOf("if (!session)"), source.indexOf("const onTheAccount"));
    assert.ok(signedOutBlock.length > 100, "the signed-out block was not found");
    assert.match(signedOutBlock, /accountName=\{account\?\.name/);
    assert.match(flow(), /title=\{`Welcome, \$\{accountName\}`\}/);
  });
});

describe("resetting and deleting, and counting use", () => {
  let store: typeof import("../src/server/portalConnectionStore");
  let mutate: typeof import("../src/server/storage").mutate;

  before(async () => {
    process.env.PORTAL_BACKEND = "memory";
    const storage = await import("../src/server/storage");
    await storage.ensureHydrated();
    mutate = storage.mutate;
    store = await import("../src/server/portalConnectionStore");
  });

  beforeEach(() => {
    mutate(state => { state.portalConnections = {}; });
  });

  const open = () => store.openPortalConnection({
    agencyId: "milesymedia", clientId: "cli_1", label: "Cedar booking app", createdBy: "ed",
  });

  it("reset withdraws the old link and issues a fresh one pointing back to it", () => {
    // A reset must never leave two live links for one piece of software —
    // whichever arrives second would silently fail.
    const first = open();
    const result = store.resetPortalConnectionLink({ agencyId: "milesymedia", connectionId: first.id, by: "ed" });
    assert.ok(result);
    assert.equal(store.getPortalConnection(first.id)?.status, "revoked");
    assert.equal(result!.replacement.status, "pending");
    assert.equal(result!.replacement.replacedId, first.id);
    assert.notEqual(result!.replacement.id, first.id);
  });

  it("will not reset another agency's link", () => {
    const first = open();
    assert.equal(store.resetPortalConnectionLink({ agencyId: "someone-else", connectionId: first.id, by: "them" }), null);
    assert.equal(store.getPortalConnection(first.id)?.status, "pending", "nothing may change on a refusal");
  });

  it("delete removes the record outright, and only within the agency", () => {
    const first = open();
    assert.equal(store.deletePortalConnection({ agencyId: "someone-else", connectionId: first.id }), null);
    assert.ok(store.getPortalConnection(first.id), "a foreign delete must not remove it");
    assert.ok(store.deletePortalConnection({ agencyId: "milesymedia", connectionId: first.id }));
    assert.equal(store.getPortalConnection(first.id), undefined, "its own delete removes it");
  });

  it("counts uses as the software reports, and never for a link that has not connected", () => {
    // Usage is the signal that separates a live integration from one that
    // connected once and was never opened again. Absent means not measured,
    // which is not the same as zero.
    const connection = open();
    store.markPortalConnectionSeen(connection.id, 5_000);
    assert.equal(store.getPortalConnection(connection.id)?.uses, undefined, "a pending link has no uses");
    store.acceptPortalConnection({ connectionId: connection.id, viewerClientId: "cli_1", viewerUserId: "usr_1" });
    store.markPortalConnectionSeen(connection.id, 9_000);
    store.markPortalConnectionSeen(connection.id, 9_500);
    assert.equal(store.getPortalConnection(connection.id)?.uses, 2);
  });
});

describe("emailing the confirmation code", () => {
  let confirmation: typeof import("../src/lib/server/connectionConfirmation");

  before(async () => {
    confirmation = await import("../src/lib/server/connectionConfirmation.ts");
  });

  it("puts the code where a person can read it — and never a hash", () => {
    const mail = confirmation.connectionCodeEmail({ code: "482913", label: "Cedar booking app" });
    assert.match(mail.subject, /482913/, "the subject should carry the code for quick reading");
    assert.match(mail.bodyText, /482913/);
    // The HTML spaces the digits out for legibility; collapse whitespace to check.
    assert.match(mail.bodyHtml.replace(/\s+/g, ""), /482913/);
    // Never the stored hash — only the plaintext a person types.
    const hash = confirmation.hashConfirmationCode({ connectionId: "pcn_x", userId: "usr_1", code: "482913" });
    assert.doesNotMatch(mail.bodyText + mail.bodyHtml, new RegExp(hash.slice(0, 12)));
  });

  it("names the software being connected, so the code has a reason", () => {
    const mail = confirmation.connectionCodeEmail({ code: "482913", label: "Cedar booking app" });
    assert.match(mail.bodyText, /Cedar booking app/);
    assert.match(mail.bodyHtml, /Cedar booking app/);
  });

  it("states the expiry and that the code is single-use", () => {
    const mail = confirmation.connectionCodeEmail({ code: "482913", label: "Cedar booking app" });
    const minutes = Math.round(confirmation.CONFIRMATION_CODE_TTL_MS / 60_000);
    assert.match(mail.bodyText, new RegExp(`${minutes} minutes`));
    assert.match(mail.bodyText, /once/);
  });
});

describe("the send-a-code endpoint", () => {
  const read = (...p: string[]) => require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", ...p), "utf-8") as string;
  const source = (...p: string[]) => read(...p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const route = () => source("src", "app", "api", "portal", "connections", "request-code", "route.ts");

  it("is gated on a signed-in session", () => {
    assert.match(route(), /getSessionFromRequest/);
    assert.match(route(), /Sign in first/);
  });

  it("mints the code before it tries to email it", () => {
    const source_ = route();
    const issueAt = source_.indexOf("issuePortalConnectionCode(");
    const sendAt = source_.indexOf("sendTransactionalEmail(");
    assert.ok(issueAt > 0, "no code is ever issued");
    assert.ok(issueAt < sendAt, "an email is sent before a code exists");
  });

  it("always sends to the session's own email, never an address from the request", () => {
    // The code proves the person is who their session says. Letting the request
    // pick the recipient would defeat the whole point.
    const source_ = route();
    assert.match(source_, /to: session\.email/);
    assert.doesNotMatch(source_, /body[?.]*\.email/);
  });

  it("will not mint a code it cannot deliver, outside dev", () => {
    const source_ = route();
    assert.match(source_, /transactionalEmailReadiness/);
    assert.match(source_, /isDevModeEnabled\(\)/);
  });

  it("keys each send by the code's expiry, so a resend is a genuinely new send", () => {
    assert.match(route(), /connect-code:\$\{connectionId\}:\$\{issued\.expiresAt\}/);
  });

  it("caps how many codes one connection can be sent, so it can't spam an inbox", () => {
    assert.match(route(), /rateLimit\(/);
    assert.match(route(), /connect-code-send:/);
  });
});

describe("the accept endpoint guards guessing", () => {
  const read = (...p: string[]) => require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", ...p), "utf-8") as string;
  const source = (...p: string[]) => read(...p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const route = () => source("src", "app", "api", "portal", "connections", "accept", "route.ts");

  it("rate-limits verify attempts by source, on top of the per-code lockout", () => {
    assert.match(route(), /rateLimit\(/);
    assert.match(route(), /connect-accept:/);
  });

  it("counts a wrong guess, but never a locked or throttled one", () => {
    // Otherwise a locked code would keep climbing its own counter for nothing.
    const source_ = route();
    assert.match(source_, /confirmation\.status === "wrong-code"/);
    assert.match(source_, /recordPortalConnectionCodeAttempt/);
  });
});

describe("the radar scans portal connections", () => {
  it("carries a portal-connections family in the systems domain", async () => {
    const { RADAR_SIGNAL_FAMILIES } = await import("../src/engines/data/radar/radarRuleCatalog.ts");
    const families = RADAR_SIGNAL_FAMILIES.systems.map(family => family.id);
    assert.ok(families.includes("portal-connections"), "the radar has no portal-connections family");
  });

  it("adds an observation the radar can read, so it is scanned like any other source", () => {
    // The comment quotes what this looks for, so strip comments before matching.
    const source = (require("node:fs").readFileSync(
      require("node:path").join(__dirname, "..", "src", "engines", "data", "server", "radar", "radarObservations.ts"), "utf-8") as string)
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    assert.match(source, /add\("systems", "portal-connections"/);
    // Freshness must be able to go blind: the measured-at comes from the
    // heartbeat, which does not exist yet, not from a fabricated "now".
    assert.match(source, /newest\(activePortalConnections\.map\(connection => connection\.lastSeenAt\)\)/);
  });
});

describe("a customer disconnecting their own software", () => {
  let store: typeof import("../src/server/portalConnectionStore");
  let mutate: typeof import("../src/server/storage").mutate;

  before(async () => {
    process.env.PORTAL_BACKEND = "memory";
    const storage = await import("../src/server/storage");
    await storage.ensureHydrated();
    mutate = storage.mutate;
    store = await import("../src/server/portalConnectionStore");
  });

  beforeEach(() => {
    mutate(state => { state.portalConnections = {}; });
  });

  const opened = () => store.openPortalConnection({
    agencyId: "milesymedia", clientId: "cli_1", label: "Cedar booking app", createdBy: "ed",
  });
  const connectedBy = (userId: string) => {
    const connection = opened();
    store.acceptPortalConnection({ connectionId: connection.id, viewerClientId: "cli_1", viewerUserId: userId });
    return connection.id;
  };

  it("keeps the promise made on the connect screen — they can disconnect their own", () => {
    const id = connectedBy("usr_1");
    const revoked = store.withdrawOwnPortalConnection({ connectionId: id, viewerClientId: "cli_1", viewerUserId: "usr_1" });
    assert.equal(revoked?.status, "revoked");
    assert.equal(store.getPortalConnection(id)?.status, "revoked");
  });

  it("will not let them reach a colleague's connection", () => {
    // Each connection is bound to the person who consented; disconnecting is
    // personal, not a client-admin power granted by default.
    const id = connectedBy("usr_1");
    assert.equal(store.withdrawOwnPortalConnection({ connectionId: id, viewerClientId: "cli_1", viewerUserId: "usr_2" }), null);
    assert.equal(store.getPortalConnection(id)?.status, "active", "a colleague's attempt changes nothing");
  });

  it("will not let a different client disconnect it by id", () => {
    const id = connectedBy("usr_1");
    assert.equal(store.withdrawOwnPortalConnection({ connectionId: id, viewerClientId: "cli_other", viewerUserId: "usr_1" }), null);
    assert.equal(store.getPortalConnection(id)?.status, "active");
  });

  it("lists only their own active connections", () => {
    const mine = connectedBy("usr_1");
    connectedBy("usr_2");                       // a colleague's — not mine
    const pendingMineToo = opened();            // mine but never completed — not active
    void pendingMineToo;
    const list = store.listOwnPortalConnections({ clientId: "cli_1", userId: "usr_1" });
    assert.equal(list.length, 1);
    assert.equal(list[0]!.id, mine);
  });

  it("routes the customer's disconnect through their own endpoint, not the agency one", () => {
    const route = (require("node:fs").readFileSync(
      require("node:path").join(__dirname, "..", "src", "app", "api", "portal", "customer", "connections", "route.ts"), "utf-8") as string)
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    assert.match(route, /session\.role !== "end-customer"/);
    assert.match(route, /withdrawOwnPortalConnection\(/);
  });
});
