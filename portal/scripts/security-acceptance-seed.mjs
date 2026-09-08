// Threat-centre browser-acceptance seed (test lane only — never production).
//
// Writes a file-backend state containing one agency, its owner, and a target
// staff member, then prints a freshly minted owner session token. The prod
// server is then started against the SAME data file + signing secret, and the
// browser attaches the cookie — the exact-build acceptance lane.

process.env.PORTAL_BACKEND = "file";
process.env.PORTAL_DATA_FILE = process.env.PORTAL_DATA_FILE ?? "/tmp/security-acceptance-state.json";
process.env.PORTAL_SESSION_SECRET = process.env.PORTAL_SESSION_SECRET ?? "security-acceptance-signing-secret-0123456789";
process.env.NODE_ENV = "test";

const { ensureHydrated, flushPendingWrites } = await import("../src/server/storage.ts");
await ensureHydrated();
const { mutate } = await import("../src/server/storage.ts");
const { createUser } = await import("../src/server/users.ts");
const { issueSession } = await import("../src/lib/server/auth/auth.ts");

const AGENCY = "accept-agency";
mutate(state => {
  state.agencies[AGENCY] = {
    id: AGENCY,
    name: "Acceptance Agency",
    slug: AGENCY,
    brand: { primaryColor: "#0f172a" },
    status: "active",
    createdAt: 1,
    updatedAt: 1,
  };
});
const owner = createUser({ email: "owner-accept@example.com", password: "Accept-owner-1!", role: "agency-owner", agencyId: AGENCY, name: "Accept Owner" });
const target = createUser({ email: "target-accept@example.com", password: "Accept-target-1!", role: "agency-staff", agencyId: AGENCY, name: "Target Staff" });
await flushPendingWrites();

const token = issueSession({
  userId: owner.id,
  email: owner.email,
  role: "agency-owner",
  agencyId: AGENCY,
  agencyIds: [AGENCY],
  activeAgencyId: AGENCY,
});

console.log(JSON.stringify({ token, ownerId: owner.id, targetId: target.id, dataFile: process.env.PORTAL_DATA_FILE }));
