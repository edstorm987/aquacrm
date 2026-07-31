import { ArrowRight, Camera } from "lucide-react";
import Link from "next/link";
import { getShoots } from "@/lib/shoots";

export default async function ShootsPage() {
  const shoots = await getShoots();

  return (
    <main className="page-stack">
      <header className="page-heading">
        <span className="eyebrow"><Camera size={14} /> Shoot library</span>
        <h1>Your shoots</h1>
        <p>Finished galleries and work still moving through the edit.</p>
      </header>
      <div className="shoot-list">
        {shoots.map(shoot => (
          <article key={shoot.id}>
            <img src={shoot.cover} alt="" />
            <div className="shoot-list-copy">
              <span className={`status status-${shoot.status.toLowerCase()}`}>{shoot.status}</span>
              <h2>{shoot.title}</h2>
              <p>{shoot.summary}</p>
              <div className="meta-row"><span>{shoot.type}</span><span>{shoot.location}</span><span>{shoot.date}</span><span>{shoot.photos.length} files</span></div>
            </div>
            <Link href={`/portal/shoots/${shoot.id}`} aria-label={`Open ${shoot.title}`}><ArrowRight size={20} /></Link>
          </article>
        ))}
      </div>
    </main>
  );
}
