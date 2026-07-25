// T4 unify-fix — Unified resource catalog. Every searchable item on
// the site lives here, tagged by type. The Resource Finder page
// filters across all of these in a single input. Adding a new entry
// is one append; the finder + hub page pick it up automatically.
//
// Type taxonomy (extend as new content lands):
//   tool   — interactive thing the visitor uses (HC, BOS, audits)
//   blog   — long-form writing
//   video  — video / loom / walkthrough
//   faq    — short Q&A entries answering common questions
//
// status:
//   live  — built, link works, visitor can use it now
//   soon  — stub or coming-soon stub at the linked URL

export type ResourceType = "tool" | "blog" | "video" | "faq";
export type ResourceStatus = "live" | "soon";

export interface Resource {
  id: string;
  type: ResourceType;
  title: string;
  excerpt: string;
  href: string;
  tags: readonly string[];
  status: ResourceStatus;
  group?: string; // optional grouping label for the hub view
}

export const TYPE_META: Record<ResourceType, { icon: string; label: string; plural: string }> = {
  tool:  { icon: "🛠",  label: "Tool",  plural: "Tools" },
  blog:  { icon: "📝", label: "Blog",  plural: "Blogs" },
  video: { icon: "▶️", label: "Video", plural: "Videos" },
  faq:   { icon: "💬", label: "FAQ",   plural: "FAQs" },
};

export const RESOURCES: readonly Resource[] = [
  // ── Tools ────────────────────────────────────────────────────────────
  {
    id: "business-os",
    type: "tool",
    title: "Business OS",
    excerpt:
      "The free operating layer that sits above your CRM, inbox and calendar. Lessons, modules, niche packs, plus an honest Health Check that drives the rest of the portal.",
    href: "/business-os",
    tags: ["operating", "free", "crm", "lessons", "agency"],
    status: "live",
    group: "Operating tools",
  },
  {
    id: "incubator",
    type: "tool",
    title: "Incubator",
    excerpt:
      "Four-phase build engagement: Diagnose → Blueprint → Build → Launch. Owned-output at every stage. Twelve-week sprint, you keep everything.",
    href: "/incubator",
    tags: ["build", "engagement", "phases", "agency"],
    status: "live",
    group: "Operating tools",
  },
  {
    id: "health-check",
    type: "tool",
    title: "Health Check",
    excerpt:
      "12-minute diagnostic. Five honest pillars (Visibility, Website, Customers, Business, Retention). Dollar-anchored opportunities, no fabricated benchmarks.",
    href: "/health-check",
    tags: ["audit", "diagnostic", "free", "seo", "ux"],
    status: "live",
    group: "Audits & diagnostics",
  },
  {
    id: "seo-audit",
    type: "tool",
    title: "SEO audit",
    excerpt:
      "Where you rank, what's indexed, what's missing. Pulls real Search Console + GBP signals.",
    href: "/resources/seo-audit",
    tags: ["seo", "ranking", "google", "audit", "search"],
    status: "live",
    group: "Audits & diagnostics",
  },
  {
    id: "site-speed",
    type: "tool",
    title: "Site speed test",
    excerpt:
      "Lighthouse-style read of your homepage — performance, accessibility, SEO, best-practices.",
    href: "/resources/site-speed",
    tags: ["performance", "lighthouse", "speed", "lcp", "audit"],
    status: "live",
    group: "Audits & diagnostics",
  },
  {
    id: "accessibility-audit",
    type: "tool",
    title: "Accessibility audit",
    excerpt:
      "WCAG 2.1 AA quick scan. Contrast, keyboard, screen-reader signals.",
    href: "/resources/accessibility-audit",
    tags: ["a11y", "accessibility", "wcag", "audit"],
    status: "live",
    group: "Audits & diagnostics",
  },
  {
    id: "ux-orchestration",
    type: "tool",
    title: "UX orchestration",
    excerpt:
      "Map your customer journey end-to-end. Surface the friction points where revenue leaks.",
    href: "/resources/ux-orchestration",
    tags: ["ux", "journey", "conversion", "design"],
    status: "soon",
    group: "Operating tools",
  },
  {
    id: "copy-clinic",
    type: "tool",
    title: "Copy clinic",
    excerpt:
      "5-second-test your homepage hero. Get a one-paragraph rewrite that leads with the buyer's outcome instead of your features.",
    href: "/resources/copy-clinic",
    tags: ["copy", "hero", "homepage", "conversion"],
    status: "soon",
    group: "Operating tools",
  },

  // ── Blogs (placeholder seed; real posts replace these) ─────────────
  {
    id: "blog-honest-numbers",
    type: "blog",
    title: "Why we refuse to fabricate metrics",
    excerpt:
      "Most agency pitches lead with someone else's lift number. Here's what we put in their place — and why it builds more trust than the fake one ever could.",
    href: "/resources/playbooks",
    tags: ["honesty", "trust", "pitch", "agency"],
    status: "soon",
    group: "Reading",
  },
  {
    id: "blog-one-pager",
    type: "blog",
    title: "The one-pager that converts",
    excerpt:
      "If you only have time to ship one page, this is it. Hero, three concrete promises, social proof, single CTA. Six rules and a free template.",
    href: "/resources/playbooks",
    tags: ["copy", "hero", "homepage", "starter"],
    status: "soon",
    group: "Reading",
  },
  {
    id: "blog-gbp-checklist",
    type: "blog",
    title: "Google Business Profile in 15 minutes",
    excerpt:
      "The single biggest local-search lever most service businesses haven't pulled. Step-by-step, photos to use, posts to schedule.",
    href: "/resources/playbooks",
    tags: ["seo", "local", "gbp", "google", "free"],
    status: "soon",
    group: "Reading",
  },

  // ── Videos (placeholder seed) ───────────────────────────────────────
  {
    id: "video-incubator-walkthrough",
    type: "video",
    title: "Incubator walkthrough — the 4 phases",
    excerpt:
      "Five-minute Loom showing what happens in each phase of the Incubator engagement, with real client examples.",
    href: "/incubator",
    tags: ["incubator", "walkthrough", "process"],
    status: "soon",
    group: "Watch",
  },
  {
    id: "video-bos-tour",
    type: "video",
    title: "Business OS — three-minute tour",
    excerpt:
      "What the BOS gives you for free, the upgrade path, and how it fits with the Health Check + Incubator.",
    href: "/business-os",
    tags: ["bos", "tour", "free"],
    status: "soon",
    group: "Watch",
  },

  // ── FAQs ────────────────────────────────────────────────────────────
  {
    id: "faq-pricing",
    type: "faq",
    title: "How much does this cost?",
    excerpt:
      "Health Check is free. Business OS is free. The Incubator is the paid engagement — pricing scales with scope; ranges, not points.",
    href: "/health-check",
    tags: ["pricing", "cost", "free"],
    status: "live",
    group: "FAQs",
  },
  {
    id: "faq-data",
    type: "faq",
    title: "Where does my data live?",
    excerpt:
      "On your account, in your portal. Self-reported in localStorage today; we move it to your own Postgres when you graduate from BOS into the Incubator.",
    href: "/resources/playbooks",
    tags: ["data", "privacy", "storage"],
    status: "live",
    group: "FAQs",
  },
  {
    id: "faq-niche",
    type: "faq",
    title: "Do you only work with one niche?",
    excerpt:
      "We've shipped niche-specific packs for skincare, coaching, fitness and agencies — with a generic pack underneath that works for anyone else.",
    href: "/for-skincare",
    tags: ["niche", "industry", "industries"],
    status: "live",
    group: "FAQs",
  },
  {
    id: "faq-team-size",
    type: "faq",
    title: "Will this work if I'm a one-person business?",
    excerpt:
      "Yes — the BOS and Health Check are designed for solo operators first. The agency-tier surface is opt-in once you start adding team members.",
    href: "/business-os",
    tags: ["solo", "team", "size"],
    status: "live",
    group: "FAQs",
  },
  {
    id: "faq-honesty",
    type: "faq",
    title: "Why are there ranges instead of exact numbers?",
    excerpt:
      "Because most marketing reports lie with false precision. We give honest ranges anchored to what you actually told us. Real numbers come from your own data, not ours.",
    href: "/resources/playbooks",
    tags: ["honesty", "numbers", "ranges"],
    status: "live",
    group: "FAQs",
  },
];

export function searchResources(query: string, typeFilter?: ResourceType | "all"): Resource[] {
  const q = query.trim().toLowerCase();
  const pool = !typeFilter || typeFilter === "all"
    ? RESOURCES
    : RESOURCES.filter(r => r.type === typeFilter);
  if (!q) return [...pool];
  return pool.filter(r => {
    const haystack = (r.title + " " + r.excerpt + " " + r.tags.join(" ")).toLowerCase();
    return q.split(/\s+/).every(token => haystack.includes(token));
  });
}
