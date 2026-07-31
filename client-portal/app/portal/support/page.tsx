import { ArrowRight, LifeBuoy, Mail, MessageSquareText } from "lucide-react";
import Link from "next/link";

export default function SupportPage() {
  return (
    <main className="page-stack">
      <header className="page-heading">
        <span className="eyebrow"><LifeBuoy size={14} /> Client support</span>
        <h1>What do you need?</h1>
        <p>Keep shoot questions here and use Aqua for anything concerning your plan, billing or ongoing service.</p>
      </header>
      <div className="option-grid">
        <a href="mailto:hello@milesymedia.co?subject=Client portal support">
          <Mail /><strong>Email Milesymedia</strong><span>For files, edits and shoot questions.</span><ArrowRight size={17} />
        </a>
        <Link href="/portal/aqua">
          <MessageSquareText /><strong>Open Aqua support</strong><span>For plans, billing and service requests.</span><ArrowRight size={17} />
        </Link>
      </div>
    </main>
  );
}
