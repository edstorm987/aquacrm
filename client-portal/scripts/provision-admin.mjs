import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = (process.env.PORTAL_ADMIN_EMAIL || "edwardhallam07@gmail.com").trim().toLowerCase();
const password = process.env.PORTAL_ADMIN_PASSWORD;
const fullName = process.env.PORTAL_ADMIN_NAME || "Ed Hallam";

if (!url || !serviceRoleKey || !password) {
  console.error("Missing required env. Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and PORTAL_ADMIN_PASSWORD.");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const { data: existing, error: listError } = await supabase.auth.admin.listUsers();
if (listError) throw listError;

const existingUser = existing.users.find(user => user.email?.toLowerCase() === email);
const authResult = existingUser
  ? await supabase.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })
  : await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

if (authResult.error) throw authResult.error;

const user = authResult.data.user;
if (!user) throw new Error("Supabase did not return a user.");

const { error: profileError } = await supabase
  .from("profiles")
  .upsert({
    id: user.id,
    email,
    full_name: fullName,
    role: "owner",
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });

if (profileError) throw profileError;

console.log(`Server admin ready: ${email}`);
