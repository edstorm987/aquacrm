import { ArrowRight, Camera, CheckCircle2, Download, Images } from "lucide-react";
import Link from "next/link";
import { shoots } from "@/lib/shoots";

export default function PortalHome() {
  const ready = shoots.filter(shoot => shoot.status === "Ready");
  const latest = shoots[0];
  return (
    <main className="page-stack">
      <header className="page-heading">
        <span className="eyebrow">Welcome back</span>
        <h1>Your work, ready when you are.</h1>
        <p>Every finished frame, active shoot and download in one calm place.</p>
      </header>
      <section className="summary-strip" aria-label="Portal summary">
        <div><Images size={18} /><span>Delivered shoots</span><strong>{ready.length}</strong></div>
        <div><Camera size={18} /><span>In editing</span><strong>{shoots.length - ready.length}</strong></div>
        <div><Download size={18} /><span>Files available</span><strong>{shoots.reduce((total, shoot) => total + shoot.photos.length, 0)}</strong></div>
      </section>
      <section className="feature-shoot">
        <img src={latest.cover} alt="" />
        <div className="feature-overlay">
          <span><CheckCircle2 size={15} /> Latest delivery</span>
          <h2>{latest.title}</h2>
          <p>{latest.summary}</p>
          <Link href={`/portal/shoots/${latest.id}`}>Open gallery <ArrowRight size={16} /></Link>
        </div>
      </section>
      <section>
        <div className="section-heading">
          <div><span className="eyebrow">Your library</span><h2>Recent shoots</h2></div>
          <Link href="/portal/shoots">View all <ArrowRight size={15} /></Link>
        </div>
        <div className="shoot-grid">
          {shoots.slice(0, 3).map(shoot => (
            <Link className="shoot-card" href={`/portal/shoots/${shoot.id}`} key={shoot.id}>
              <img src={shoot.cover} alt="" />
              <div><span>{shoot.type}</span><strong>{shoot.title}</strong><small>{shoot.date} · {shoot.photos.length} files</small></div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
