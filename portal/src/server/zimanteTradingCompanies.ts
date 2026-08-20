import "server-only";

import { TRADING_BRANDS, type TradingBrandSlug } from "@/lib/brands/tradingBrands";
import { createAgencyProduct, listAgencyProducts } from "./agencyProducts";
import { createTradingCompany, listTradingCompanies } from "./tradingCompanies";
import type { TradingCompany } from "./types";

export function ensureZimanteTradingCompanies(
  agencyId: string,
  actorUserId: string,
): Record<TradingBrandSlug, TradingCompany> {
  const existing = listTradingCompanies(agencyId, true);
  const companies = {} as Record<TradingBrandSlug, TradingCompany>;

  for (const brand of TRADING_BRANDS) {
    const found = existing.find((company) => company.slug === brand.slug);
    const input = {
      name: brand.name,
      slug: brand.slug,
      description: brand.description,
      website: "website" in brand ? brand.website : undefined,
      status: "active" as const,
      brand: {
        primaryColor: brand.primaryColor,
        secondaryColor: brand.secondaryColor,
        accentColor: brand.accentColor,
        borderRadius: "8px",
      },
    };
    companies[brand.slug] = found ?? createTradingCompany(agencyId, input, actorUserId);
  }

  ensureZimanteProducts(agencyId, actorUserId, companies);
  return companies;
}

function ensureZimanteProducts(
  agencyId: string,
  actorUserId: string,
  companies: Record<TradingBrandSlug, TradingCompany>,
) {
  const existingNames = new Set(listAgencyProducts(agencyId, true).map((product) => product.name));
  const definitions = [
    {
      brand: "zimante-group",
      name: "Combined group project",
      category: "Combined work",
      description: "One coordinated project combining products from two or more Zimante specialists.",
      deliverables: ["Coordinated scope", "Specialist delivery", "One client project record"],
    },
    {
      brand: "milesymedia",
      name: "Business and event photography",
      category: "Media",
      description: "Commercial coverage for businesses, teams, launches and events.",
      deliverables: ["Shoot planning", "Photography coverage", "Edited delivery gallery"],
    },
    {
      brand: "milesymedia",
      name: "Staff and personal branding photography",
      category: "Media",
      description: "Portraits for teams, founders, experts and personal brands.",
      deliverables: ["Visual brief", "Directed portrait session", "Edited image selection"],
    },
    {
      brand: "milesymedia",
      name: "Property media",
      category: "Media",
      description: "Photography and video for spaces, venues and property.",
      deliverables: ["Shot plan", "On-location production", "Edited media delivery"],
    },
    {
      brand: "milesymedia",
      name: "Automotive media",
      category: "Media",
      description: "Still and motion work for vehicles, collections and automotive events.",
      deliverables: ["Creative brief", "On-location production", "Edited media delivery"],
    },
    {
      brand: "milesymedia",
      name: "Wedding and personal photography",
      category: "Media",
      description: "Natural coverage for weddings, portraits and personal milestones.",
      deliverables: ["Planning call", "Photography coverage", "Private edited gallery"],
    },
    {
      brand: "milesymedia",
      name: "Sport and action media",
      category: "Media",
      description: "Photography and video designed around movement and atmosphere.",
      deliverables: ["Coverage plan", "Action production", "Edited media delivery"],
    },
    {
      brand: "aquaoasis-web",
      name: "Google Profile foundation",
      category: "Web and visibility",
      description: "Google Business Profile, business details, imagery, reviews and local foundations.",
      deliverables: ["Profile setup or rebuild", "Trust and contact details", "Review foundations"],
    },
    {
      brand: "aquaoasis-web",
      name: "AquaOasis website build",
      category: "Web and visibility",
      description: "An enquiry-ready website built around the offer, area and customer next step.",
      pricing: "from",
      priceCents: 89_900,
      deliverables: ["Website strategy", "Design and build", "Testing and launch"],
    },
    {
      brand: "aquaoasis-web",
      name: "Creator presence setup",
      category: "Web and visibility",
      description: "Profiles, links, bios and contact routes for creators and personal brands.",
      deliverables: ["Channel setup", "Profile structure", "Contact journey"],
    },
    {
      brand: "aquaoasis-web",
      name: "Digital growth support",
      category: "Web and visibility",
      description: "SEO, content, social and campaign support after the digital foundation is ready.",
      deliverables: ["Growth plan", "Campaign support", "Performance review"],
    },
    {
      brand: "software-studio",
      name: "Customer portal",
      category: "Software",
      description: "A branded customer home for progress, files, billing, feedback and support.",
      deliverables: ["Portal design", "Workflow and data integration", "Testing and launch"],
    },
    {
      brand: "software-studio",
      name: "Internal operations system",
      category: "Software",
      description: "A bespoke workspace replacing scattered operational admin.",
      deliverables: ["Workflow mapping", "Application build", "Team handover"],
    },
    {
      brand: "software-studio",
      name: "Bespoke ecommerce platform",
      category: "Software",
      description: "A connected storefront and order operation designed around the business.",
      deliverables: ["Commerce journey", "Operational tooling", "Testing and release"],
    },
    {
      brand: "software-studio",
      name: "Business automation",
      category: "Software",
      description: "Connected workflows that remove repetition while preserving human decisions.",
      deliverables: ["Process map", "Automation build", "Monitoring and handover"],
    },
    {
      brand: "software-studio",
      name: "Operational dashboard",
      category: "Software",
      description: "A single operational view of data, exceptions and next actions.",
      deliverables: ["Signal definition", "Dashboard build", "Data connection"],
    },
  ] as const;

  for (const definition of definitions) {
    if (existingNames.has(definition.name)) continue;
    createAgencyProduct(agencyId, {
      companyIds: [companies[definition.brand].id],
      name: definition.name,
      category: definition.category,
      description: definition.description,
      pricing: "pricing" in definition ? definition.pricing : "custom",
      priceCents: "priceCents" in definition ? definition.priceCents : undefined,
      deliverables: [...definition.deliverables],
      portalRequirement: "optional",
    }, actorUserId);
    existingNames.add(definition.name);
  }
}
