import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  Blocks,
  CheckCircle2,
  Code2,
  Database,
  Gauge,
  LifeBuoy,
  LockKeyhole,
  PlugZap,
  Workflow,
} from "lucide-react";

const capabilities = [
  {
    icon: Workflow,
    title: "Pipeline to delivery",
    copy: "Track prospects, meetings, client decisions, fulfilment, launch and support without splitting the story across tools.",
  },
  {
    icon: Blocks,
    title: "Client portals",
    copy: "Create a branded client home for onboarding, files, feedback, invoices, approvals and live-mode support.",
  },
  {
    icon: Code2,
    title: "Development workspace",
    copy: "Keep websites, apps, repos, environments and monitoring connected to the customer record they belong to.",
  },
  {
    icon: BarChart3,
    title: "Performance visibility",
    copy: "Bring forms, traffic, conversions, milestones, service health and client outcomes into one usable view.",
  },
  {
    icon: LifeBuoy,
    title: "Support and tickets",
    copy: "Turn messages, requests, outages and follow-ups into action instead of letting them disappear in inboxes.",
  },
  {
    icon: Database,
    title: "A business memory",
    copy: "Keep notes, contracts, invoices, files, logs and decisions searchable across every client and project.",
  },
];

const journey = [
  "Capture the opportunity and qualify it cleanly.",
  "Create the client workspace before the final product exists.",
  "Build, review and launch with the client kept in the loop.",
  "Move into live support, billing, monitoring and improvement.",
];

export default function HomePage() {
  return (
    <main className="crm-site">
      <header className="crm-marketing-header">
        <Link className="crm-brand" href="/" aria-label="AquaCRM home">
          <span aria-hidden="true">A</span>
          <strong>AquaCRM</strong>
        </Link>
        <nav aria-label="AquaCRM navigation">
          <a href="#platform">Platform</a>
          <a href="#portals">Portals</a>
          <a href="#workflow">Workflow</a>
          <a href="#contact">Contact</a>
          <Link className="crm-nav-login" href="/login">
            Sign in
          </Link>
        </nav>
      </header>

      <section className="crm-hero">
        <div className="crm-hero-copy">
          <p className="crm-kicker">Client portals · delivery · support · operations</p>
          <h1>The operating system for client work.</h1>
          <p>
            AquaCRM keeps the whole journey together: lead, meeting, proposal,
            client portal, build, billing, support and the live systems behind
            each customer.
          </p>
          <div className="crm-actions">
            <a href="#contact">
              Talk about AquaCRM <ArrowRight size={18} />
            </a>
            <Link href="/login">
              Workspace sign in <LockKeyhole size={17} />
            </Link>
          </div>
        </div>

        <div className="crm-product-frame" aria-label="AquaCRM product preview">
          <div className="crm-product-top">
            <span />
            <span />
            <span />
            <strong>AquaCRM live workspace</strong>
          </div>
          <div className="crm-product-grid">
            <article>
              <p>Pipeline</p>
              <strong>12</strong>
              <span>active opportunities</span>
            </article>
            <article>
              <p>Portals</p>
              <strong>8</strong>
              <span>client homes live</span>
            </article>
            <article>
              <p>Support</p>
              <strong>3</strong>
              <span>needs attention</span>
            </article>
          </div>
          <div className="crm-product-list">
            {["New lead captured", "Portal preview approved", "Launch checklist due"].map((item) => (
              <div key={item}>
                <CheckCircle2 size={18} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="crm-proof" aria-label="AquaCRM outcomes">
        <p>One client record</p>
        <p>Branded portals</p>
        <p>Human-in-the-loop actions</p>
        <p>Live support visibility</p>
      </section>

      <section id="platform" className="crm-section">
        <div className="crm-section-heading">
          <p className="crm-kicker">What it does</p>
          <h2>Everything important stays attached to the customer.</h2>
          <p>
            AquaCRM is built for service businesses that need to sell, build,
            hand over and support work without losing context between stages.
          </p>
        </div>
        <div className="crm-capability-grid">
          {capabilities.map(({ icon: Icon, title, copy }) => (
            <article key={title}>
              <Icon size={24} />
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="portals" className="crm-split">
        <div>
          <p className="crm-kicker">Portals first</p>
          <h2>A client can have somewhere useful to log in from day one.</h2>
          <p>
            Start with an Aqua-powered onboarding portal, then connect or embed
            it into the customer’s final custom portal once the product is live.
            The client experience stays branded; your internal team keeps the
            operational view.
          </p>
        </div>
        <div className="crm-stack-card">
          <PlugZap size={24} />
          <strong>Aqua tag ready</strong>
          <p>
            Connect a website, product or portal back to AquaCRM so monitoring,
            support and client activity can be tracked in one place.
          </p>
        </div>
      </section>

      <section id="workflow" className="crm-section crm-workflow">
        <div className="crm-section-heading">
          <p className="crm-kicker">The repeatable loop</p>
          <h2>From interest to live support without losing the thread.</h2>
        </div>
        <ol>
          {journey.map((step, index) => (
            <li key={step}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{step}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="crm-split crm-dark">
        <div>
          <p className="crm-kicker">Production-minded</p>
          <h2>Designed for real operations, not a demo that falls apart later.</h2>
          <p>
            Permissions, logs, forms, storage, finance records and external
            access are treated as first-class parts of the system. The aim is
            fewer blind spots, not more screens.
          </p>
        </div>
        <div className="crm-stack-card">
          <BellRing size={24} />
          <strong>Attention where it matters</strong>
          <p>
            Overdue work, support pressure, missing documents and production
            issues can become clear actions instead of background noise.
          </p>
        </div>
      </section>

      <section id="contact" className="crm-closing">
        <div>
          <Gauge size={30} />
          <h2>Building something that needs a proper operating layer?</h2>
          <p>
            AquaCRM is the software side of the Aqua ecosystem. Use it for
            portals, delivery visibility, support, internal tools and connected
            customer operations.
          </p>
        </div>
        <a href="mailto:edwardhallam07@gmail.com">
          Start the conversation <ArrowRight size={18} />
        </a>
      </section>
    </main>
  );
}
