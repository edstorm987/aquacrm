// Portal-variant starter block trees + summary catalogue.
//
// Faithful port of `02/src/lib/admin/portalStarters.ts` — `starterForRole`
// returns the block tree the editor should seed when an operator clicks
// "+ New variant" on /admin/portals. Combined with the Round-1 metadata
// list (STARTERS / listStartersForRole / getStarter) used by the
// admin's variant catalogue.

import type { Block } from "../types/block";
import type { PortalRole } from "./portalRole";

let nextSeed = 0;
function blockId(prefix: string): string {
  nextSeed += 1;
  return `${prefix}_${nextSeed.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function makeBlock(type: Block["type"], props: Record<string, unknown>, children?: Block[]): Block {
  const block: Block = {
    id: blockId(type),
    type,
    props,
  };
  if (children && children.length > 0) block.children = children;
  return block;
}

export function starterForRole(role: PortalRole): Block[] {
  switch (role) {
    case "login":
      return [
        makeBlock("section", {}, [
          makeBlock("heading", { text: "Welcome back", level: 1 }),
          makeBlock("text", { text: "Sign in to manage your account, view orders, and track shipments." }),
          makeBlock("login-form", {
            title: "Sign in",
            submitLabel: "Sign in",
            action: "/api/auth/login",
            showRemember: true,
            showForgot: true,
            showSignupLink: true,
          }),
        ]),
      ];

    case "affiliates":
      return [
        makeBlock("section", {}, [
          makeBlock("heading", { text: "Affiliate program", level: 1 }),
          makeBlock("text", {
            text: "Earn commission on every customer you refer. Sign in to grab your unique link and track your referrals in real time.",
          }),
          makeBlock("stats-bar", {
            stats: [
              { label: "Avg commission", value: "10%" },
              { label: "Cookie window", value: "30 days" },
              { label: "Payout", value: "Monthly" },
            ],
          }),
          makeBlock("login-form", {
            title: "Affiliate sign in",
            submitLabel: "Sign in",
            action: "/api/auth/login",
            showSignupLink: true,
            signupHref: "/account?mode=signup&intent=affiliate",
          }),
        ]),
      ];

    case "orders":
      return [
        makeBlock("section", {}, [
          makeBlock("heading", { text: "Your orders", level: 1 }),
          makeBlock("text", {
            text: "Every order you've placed, with status, tracking, and quick links to receipts.",
          }),
          makeBlock("banner", {
            title: "Need help?",
            message: "Get in touch — we usually reply within a few hours.",
            ctaLabel: "Contact support",
            ctaHref: "/contact",
          }),
        ]),
      ];

    case "account":
      return [
        makeBlock("section", {}, [
          makeBlock("heading", { text: "Your account", level: 1 }),
          makeBlock("text", { text: "Quick links to everything you need." }),
          makeBlock("card-grid", {
            cards: [
              { title: "Orders",      href: "/account/orders",      description: "Track shipments, request returns." },
              { title: "Profile",     href: "/account?tab=profile", description: "Update name, email, password." },
              { title: "Affiliates",  href: "/affiliates",          description: "Your referral link and commissions." },
              { title: "Preferences", href: "/account?tab=privacy", description: "Email, cookies, marketing." },
            ],
          }),
        ]),
      ];
  }
}

// ─── Catalogue (metadata for the admin's variant picker) ────────────────────

export interface StarterSummary {
  variantId: string;
  role: PortalRole;
  title: string;
  description?: string;
}

export const STARTERS: StarterSummary[] = [
  { variantId: "login-default",     role: "login",      title: "Login",                 description: "Minimal sign-in surface." },
  { variantId: "login-onboarding",  role: "login",      title: "Login (onboarding)",    description: "Welcome-first variant." },
  { variantId: "login-design",      role: "login",      title: "Login (design-forward)",description: "Marketing split layout." },
  { variantId: "affiliates-default",role: "affiliates", title: "Affiliates",            description: "Stats + signup." },
  { variantId: "orders-default",    role: "orders",     title: "Orders",                description: "Banner + support CTA." },
  { variantId: "account-default",   role: "account",    title: "Account",               description: "4-card hub." },
];

export function listStartersForRole(role: PortalRole): StarterSummary[] {
  return STARTERS.filter(s => s.role === role);
}

export function getStarter(variantId: string): StarterSummary | undefined {
  return STARTERS.find(s => s.variantId === variantId);
}
