// /login/magic?token=…&return=…
// Server-side redirect into the verify route. Keeps the magic URL
// renderable as a clean human-friendly path; the actual cookie+session
// issuance happens inside `/api/auth/magic/verify`.

import { redirect } from "next/navigation";

export default async function MagicLandingPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  const ret = typeof sp.return === "string" ? sp.return : "/portal/customer";
  if (!token) redirect("/login?magic_error=missing_token");
  const url = new URL("/api/auth/magic/verify", "http://placeholder");
  url.searchParams.set("token", token);
  url.searchParams.set("return", ret);
  redirect(`${url.pathname}${url.search}`);
}
