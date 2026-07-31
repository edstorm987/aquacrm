import { Camera, CheckCircle2, CircleDot, ExternalLink, HardDriveUpload } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPortalSession } from "@/lib/auth";
import { shoots } from "@/lib/shoots";

export default async function AdminPage() {
  const session = await getPortalSession();
  if (session?.role !== "admin") redirect("/portal");
  return (
    <main className="page-stack">
      <header className="page-heading">
        <span className="eyebrow">Admin workspace</span>
        <h1>Run the client experience.</h1>
        <p>Review what the client sees, keep delivery clear and manage the Aqua relationship without mixing the two codebases.</p>
      </header>
      <section className="admin-status">
        <div><CheckCircle2 /><span>Client portal</span><strong>Online</strong></div>
        <div><CheckCircle2 /><span>Aqua embed</span><strong>Connected</strong></div>
        <div><CircleDot /><span>Media storage</span><strong>Local preview</strong></div>
      </section>
      <section className="admin-grid">
        <article>
          <HardDriveUpload />
          <h2>Delivery library</h2>
          <p>{shoots.length} shoots and {shoots.reduce((total, shoot) => total + shoot.photos.length, 0)} files are currently visible in this repository.</p>
          <Link href="/portal/shoots">Review client galleries <ExternalLink size={14} /></Link>
        </article>
        <article>
          <Camera />
          <h2>Next storage step</h2>
          <p>When Supabase is added, uploads and gallery publishing will plug into this admin surface. The public client routes do not need to change.</p>
          <span>Architecture ready</span>
        </article>
      </section>
    </main>
  );
}
