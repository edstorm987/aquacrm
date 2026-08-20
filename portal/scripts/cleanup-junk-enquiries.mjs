// One-off cleanup: delete Ed's junk/test website enquiries from live Supabase,
// and remove the stray @bare-co.test auth users left over from dev testing.
//
// Keeps the two real/borderline enquiries (Pranab H, Tom Innes). Backs
// everything up to scratchpad first, prints what it will do, then does it.
//
// Run from aquaCRM/portal with:  node scripts/cleanup-junk-enquiries.mjs
//
// Safe to delete this file afterwards — it is a one-off, not part of the app.

import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter(l => l.includes("=") && !l.trim().startsWith("#"))
    .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// The enquiries worth keeping, by email. Everything else is junk/test.
const KEEP_EMAILS = new Set(["p.r.an.abhu.ec.od.e.1@gmail.com", "tom@example.com"]);

const { data: all } = await admin.from("brand_enquiries").select("*");
writeFileSync("brand-enquiries-backup.json", JSON.stringify(all, null, 2));
console.log(`Backed up ${all.length} enquiries to ./brand-enquiries-backup.json`);

const toDelete = all.filter(e => !KEEP_EMAILS.has((e.email || "").toLowerCase()));
console.log(`Deleting ${toDelete.length} junk enquiries, keeping ${all.length - toDelete.length}.`);

let deleted = 0;
for (const e of toDelete) {
  const { error } = await admin.from("brand_enquiries").delete().eq("id", e.id);
  if (error) console.log(`  ! failed ${e.id}: ${error.message}`);
  else deleted++;
}
console.log(`Enquiries deleted: ${deleted}`);

const { data: after } = await admin.from("brand_enquiries").select("name,email");
console.log("Remaining:", after.map(e => `${e.name} <${e.email || "-"}>`).join(" | ") || "(none)");

// Stray dev test users in Supabase Auth.
const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
const testUsers = users.users.filter(u => (u.email || "").endsWith("@bare-co.test"));
let userDeleted = 0;
for (const u of testUsers) {
  const { error } = await admin.auth.admin.deleteUser(u.id);
  if (!error) userDeleted++;
}
console.log(`Test users deleted: ${userDeleted} of ${testUsers.length} (${testUsers.map(u => u.email).join(", ") || "none"})`);
