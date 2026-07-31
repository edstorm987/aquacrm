import { Inbox, Mail, Phone, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { getPortalSession } from "@/lib/auth";
import { getBrandEnquiries, type BrandEnquiry } from "@/lib/enquiries";

function brandLabel(slug: string) {
  const labels: Record<string, string> = {
    aquacrm: "AquaCRM",
    "aquaoasis-web": "AquaOasis-Web",
    milesymedia: "Milesymedia",
    "zimante-group": "Zimante Group",
  };
  return labels[slug] ?? slug;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function ResponsesPage() {
  const session = await getPortalSession();
  if (session?.role !== "admin") redirect("/portal");

  let enquiries: BrandEnquiry[] = [];
  let error = "";
  try {
    enquiries = await getBrandEnquiries();
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Unable to load responses.";
  }

  return (
    <main className="page-stack">
      <header className="page-heading">
        <span className="eyebrow"><Inbox size={14} /> Central responses</span>
        <h1>Every website form in one place.</h1>
        <p>Submissions from Milesymedia, AquaOasis-Web, Zimante Group and AquaCRM are saved in Supabase and can also notify you by email.</p>
      </header>

      <section className="admin-status">
        <div><ShieldCheck /><span>Database</span><strong>Supabase</strong></div>
        <div><Mail /><span>Email alerts</span><strong>{process.env.RESEND_API_KEY ? "Configured" : "Needs key"}</strong></div>
        <div><Inbox /><span>Latest shown</span><strong>{enquiries.length}</strong></div>
      </section>

      {error ? (
        <section className="embed-state">
          <Inbox />
          <strong>Responses need the server key</strong>
          <span>{error}</span>
        </section>
      ) : enquiries.length === 0 ? (
        <section className="embed-state">
          <Inbox />
          <strong>No responses yet</strong>
          <span>When someone completes a form, it will appear here after being saved in Supabase.</span>
        </section>
      ) : (
        <section className="response-list" aria-label="Website form responses">
          {enquiries.map((enquiry) => (
            <article key={enquiry.id}>
              <div className="response-head">
                <span>{brandLabel(enquiry.brand_slug)}</span>
                <time dateTime={enquiry.created_at}>{formatDate(enquiry.created_at)}</time>
              </div>
              <h2>{enquiry.name}</h2>
              <div className="response-contact">
                {enquiry.email ? <a href={`mailto:${enquiry.email}`}><Mail size={14} /> {enquiry.email}</a> : null}
                {enquiry.phone ? <a href={`tel:${enquiry.phone}`}><Phone size={14} /> {enquiry.phone}</a> : null}
                {enquiry.contact_method ? <span>Prefers {enquiry.contact_method}</span> : null}
              </div>
              {enquiry.services.length ? (
                <div className="response-tags">
                  {enquiry.services.map((service) => <span key={service}>{service}</span>)}
                </div>
              ) : null}
              {enquiry.message ? <p>{enquiry.message}</p> : <p className="muted">No message supplied.</p>}
              <div className="response-meta">
                {enquiry.campaign ? <span>Campaign: {enquiry.campaign}</span> : null}
                {enquiry.source_url ? <a href={enquiry.source_url} target="_blank" rel="noreferrer">Source page</a> : null}
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
