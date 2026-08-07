import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.FOUNDER_EMAIL?.trim().toLowerCase();
const password = process.env.FOUNDER_PASSWORD;
if (!url || !serviceRoleKey || !email || !password) {
  throw new Error("Supabase URL, service role key, FOUNDER_EMAIL and FOUNDER_PASSWORD are required.");
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let founder = null;
for (let page = 1; page <= 20 && !founder; page += 1) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
  if (error) throw error;
  founder = data.users.find((user) => user.email?.toLowerCase() === email) ?? null;
  if (data.users.length < 100) break;
}

if (founder) {
  const { data, error } = await supabase.auth.admin.updateUserById(founder.id, {
    password,
    email_confirm: true,
    user_metadata: { ...founder.user_metadata, full_name: "Ed Hallam", username: "Ed" },
  });
  if (error) throw error;
  founder = data.user;
} else {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Ed Hallam", username: "Ed" },
  });
  if (error) throw error;
  founder = data.user;
}

const { error: profileError } = await supabase.from("profiles").upsert({
  id: founder.id,
  email,
  full_name: "Ed Hallam",
  role: "owner",
});
if (profileError) throw profileError;

console.log(`Founder account ready: ${email} (${founder.id}).`);
