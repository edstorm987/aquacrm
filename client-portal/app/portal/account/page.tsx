import { CircleUserRound, ShieldCheck } from "lucide-react";
import { getPortalSession } from "@/lib/auth";

export default async function AccountPage() {
  const session = await getPortalSession();
  return (
    <main className="page-stack narrow-page">
      <header className="page-heading">
        <span className="eyebrow"><CircleUserRound size={14} /> Account</span>
        <h1>Your details</h1>
        <p>The identity currently signed into this private portal.</p>
      </header>
      <section className="account-panel">
        <span className="account-avatar">{session?.name.slice(0, 1)}</span>
        <div><span>Name</span><strong>{session?.name}</strong></div>
        <div><span>Email</span><strong>{session?.email}</strong></div>
        <div><span>Access</span><strong><ShieldCheck size={16} /> {session?.role === "admin" ? "Administrator" : "Client"}</strong></div>
      </section>
    </main>
  );
}
