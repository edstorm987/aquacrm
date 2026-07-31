import { Download, FileImage } from "lucide-react";
import { getShoots } from "@/lib/shoots";

export default async function DownloadsPage() {
  const shoots = await getShoots();

  return (
    <main className="page-stack">
      <header className="page-heading">
        <span className="eyebrow"><Download size={14} /> Download centre</span>
        <h1>Finished work</h1>
        <p>Download a complete shoot as one archive or open a gallery for individual files.</p>
      </header>
      <div className="data-list">
        {shoots.filter(shoot => shoot.status === "Ready").map(shoot => (
          <article key={shoot.id}>
            <span className="file-icon"><FileImage size={19} /></span>
            <div><strong>{shoot.title}</strong><span>{shoot.photos.length} high-resolution files · ZIP archive</span></div>
            <a href={`/api/downloads/shoot/${shoot.id}`}><Download size={16} /> Download</a>
          </article>
        ))}
      </div>
    </main>
  );
}
