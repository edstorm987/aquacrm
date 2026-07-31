import { ArrowLeft, Download } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import ShootGallery from "@/components/ShootGallery";
import { getShootById } from "@/lib/shoots";

export default async function ShootPage({ params }: { params: Promise<{ shootId: string }> }) {
  const { shootId } = await params;
  const shoot = await getShootById(shootId);
  if (!shoot) notFound();
  return (
    <main className="page-stack">
      <Link className="back-link" href="/portal/shoots"><ArrowLeft size={15} /> All shoots</Link>
      <header className="shoot-heading">
        <div>
          <span className="eyebrow">{shoot.type} · {shoot.location}</span>
          <h1>{shoot.title}</h1>
          <p>{shoot.summary}</p>
        </div>
        <a className="primary-action" href={`/api/downloads/shoot/${shoot.id}`}><Download size={16} /> Download shoot</a>
      </header>
      <ShootGallery photos={shoot.photos} />
    </main>
  );
}
