export type PortalProductKey =
  | "website"
  | "brand-identity"
  | "photography"
  | "google-profile"
  | "content"
  | "automation"
  | "custom-software"
  | "ongoing-care"
  | "business-os"
  | "health-check";

export interface PortalProductSelection {
  id: string;
  catalogKey?: PortalProductKey;
  name: string;
  description: string;
  deliverables: string[];
  buyerHeadline?: string;
  coverImageUrl?: string;
  accentColor?: string;
  portalHeadline?: string;
  portalWelcomeNote?: string;
}

export interface PortalProductDefinition extends PortalProductSelection {
  catalogKey: PortalProductKey;
  projectLabel: string;
  homeHeading: string;
  stageFocus: {
    onboarding: string;
    designing: string;
    "developed-launch": string;
    maintenance: string;
  };
}

export const PORTAL_PRODUCT_CATALOG: PortalProductDefinition[] = [
  {
    id: "website",
    catalogKey: "website",
    name: "Website",
    description: "Strategy, design, build and launch in one clear journey.",
    projectLabel: "Website",
    homeHeading: "Your website journey, all in one place.",
    deliverables: ["Strategy and content", "Design direction", "Build, testing and launch"],
    stageFocus: {
      onboarding: "Share your goals, audience, content and references.",
      designing: "Review the visual direction and leave focused feedback.",
      "developed-launch": "Explore the build, complete final checks and approve launch.",
      maintenance: "Request changes and keep the live experience healthy.",
    },
  },
  {
    id: "brand-identity",
    catalogKey: "brand-identity",
    name: "Brand identity",
    description: "A distinctive visual identity with practical assets ready to use.",
    projectLabel: "Brand",
    homeHeading: "Your new identity, shaped together.",
    deliverables: ["Creative direction", "Logo system", "Brand kit and usage assets"],
    stageFocus: {
      onboarding: "Share the story, audience and references behind the brand.",
      designing: "Review identity directions and explain what feels most like you.",
      "developed-launch": "Approve the final identity and check every supplied asset.",
      maintenance: "Find your brand kit and request future creative support.",
    },
  },
  {
    id: "photography",
    catalogKey: "photography",
    name: "Photography",
    description: "Planning, shoot preparation, selections and final delivery.",
    projectLabel: "Shoot",
    homeHeading: "Your shoot, from planning to final gallery.",
    deliverables: ["Shoot planning", "Photography session", "Edited image delivery"],
    stageFocus: {
      onboarding: "Confirm the brief, locations, people, timings and shot priorities.",
      designing: "Review the shoot plan, mood and visual references.",
      "developed-launch": "Review the edited selection and confirm final delivery.",
      maintenance: "Access delivered imagery and request future sessions.",
    },
  },
  {
    id: "google-profile",
    catalogKey: "google-profile",
    name: "Google profile",
    description: "A stronger local presence that helps the right customers find you.",
    projectLabel: "Visibility",
    homeHeading: "Your local presence, clearly managed.",
    deliverables: ["Profile setup", "Content and imagery", "Local visibility improvements"],
    stageFocus: {
      onboarding: "Confirm business details, service areas and customer priorities.",
      designing: "Review profile content, imagery and positioning.",
      "developed-launch": "Check the finished profile and approve publication.",
      maintenance: "Track updates, reviews and ongoing local visibility.",
    },
  },
  {
    id: "content",
    catalogKey: "content",
    name: "Content",
    description: "Useful, on-brand content planned and delivered with purpose.",
    projectLabel: "Content",
    homeHeading: "Your content, planned and moving.",
    deliverables: ["Content direction", "Creation and review", "Final assets"],
    stageFocus: {
      onboarding: "Share your audience, offers, voice and content priorities.",
      designing: "Review drafts and shape the tone and direction.",
      "developed-launch": "Approve final content and confirm publishing details.",
      maintenance: "Request new content and keep the plan current.",
    },
  },
  {
    id: "automation",
    catalogKey: "automation",
    name: "Automation",
    description: "Connected systems that remove repetitive work and missed steps.",
    projectLabel: "Systems",
    homeHeading: "Your systems, made simpler.",
    deliverables: ["Workflow mapping", "Automation build", "Testing and handover"],
    stageFocus: {
      onboarding: "Map the current process, tools, handoffs and pain points.",
      designing: "Review the proposed workflow and exception handling.",
      "developed-launch": "Test real scenarios and approve the live switch.",
      maintenance: "Monitor workflows and request improvements when needed.",
    },
  },
  {
    id: "custom-software",
    catalogKey: "custom-software",
    name: "Custom software",
    description: "A tailored digital product designed around the way you work.",
    projectLabel: "Product",
    homeHeading: "Your product, taking shape.",
    deliverables: ["Product definition", "Interface and development", "Testing and release"],
    stageFocus: {
      onboarding: "Define users, workflows, requirements and success measures.",
      designing: "Review the experience and test the proposed user journeys.",
      "developed-launch": "Use the working product, report issues and approve release.",
      maintenance: "Monitor the live system and shape future improvements.",
    },
  },
  {
    id: "ongoing-care",
    catalogKey: "ongoing-care",
    name: "Ongoing care",
    description: "Responsive support, monitoring and continuous improvement.",
    projectLabel: "Care",
    homeHeading: "Everything is looked after.",
    deliverables: ["Monitoring", "Priority support", "Ongoing improvements"],
    stageFocus: {
      onboarding: "Confirm access, priorities and the right support contacts.",
      designing: "Agree the improvement plan and what should happen first.",
      "developed-launch": "Complete the initial health checks and handover.",
      maintenance: "Use support, review performance and plan improvements.",
    },
  },
  {
    id: "business-os",
    catalogKey: "business-os",
    name: "Business OS",
    description: "A guided workspace for seeing the business clearly and deciding what comes next.",
    projectLabel: "Business OS",
    homeHeading: "Your business, made visible.",
    deliverables: ["Business snapshot", "Priority plan", "Recommended next actions"],
    stageFocus: {
      onboarding: "Complete the business snapshot and share the current reality.",
      designing: "Review priorities, opportunities and the proposed operating plan.",
      "developed-launch": "Confirm the action plan and begin the first improvements.",
      maintenance: "Keep the operating picture current and review progress.",
    },
  },
  {
    id: "health-check",
    catalogKey: "health-check",
    name: "Digital health check",
    description: "A clear assessment of digital performance, gaps and next actions.",
    projectLabel: "Health check",
    homeHeading: "Your digital picture, made clear.",
    deliverables: ["Digital review", "Findings and opportunities", "Prioritised recommendations"],
    stageFocus: {
      onboarding: "Share the business details and digital properties to review.",
      designing: "Review early findings and add any missing context.",
      "developed-launch": "Explore the final recommendations and choose next actions.",
      maintenance: "Return to the findings and track improvements over time.",
    },
  },
];

const CATALOG_BY_KEY = new Map(PORTAL_PRODUCT_CATALOG.map(product => [product.catalogKey, product]));

function cleanStrings(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map(item => item.trim().slice(0, 160))
    .filter(Boolean)
    .slice(0, limit);
}

export function cleanPortalProducts(value: unknown): PortalProductSelection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Record<string, unknown>;
    const catalogKey = typeof raw.catalogKey === "string" && CATALOG_BY_KEY.has(raw.catalogKey as PortalProductKey)
      ? raw.catalogKey as PortalProductKey
      : undefined;
    const definition = catalogKey ? CATALOG_BY_KEY.get(catalogKey) : undefined;
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 100) : definition?.name ?? "";
    if (!name) return [];
    const idSource = typeof raw.id === "string" ? raw.id : catalogKey ?? `custom-${index + 1}`;
    const id = idSource.trim().replace(/[^a-z0-9-]/gi, "-").slice(0, 80) || `custom-${index + 1}`;
    const description = typeof raw.description === "string"
      ? raw.description.trim().slice(0, 300)
      : definition?.description ?? "";
    const deliverables = cleanStrings(raw.deliverables, 8);
    const coverImageUrl = cleanHttpUrl(raw.coverImageUrl);
    const accentColor = typeof raw.accentColor === "string" && /^#[0-9a-f]{6}$/i.test(raw.accentColor)
      ? raw.accentColor.toUpperCase()
      : undefined;
    return [{
      id,
      catalogKey,
      name,
      description,
      deliverables: deliverables.length ? deliverables : definition?.deliverables ?? [],
      buyerHeadline: cleanOptionalString(raw.buyerHeadline, 180),
      coverImageUrl,
      accentColor,
      portalHeadline: cleanOptionalString(raw.portalHeadline, 180),
      portalWelcomeNote: cleanOptionalString(raw.portalWelcomeNote, 1_000),
    }];
  }).slice(0, 12);
}

function cleanOptionalString(value: unknown, limit: number): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim().slice(0, limit) || undefined;
}

function cleanHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function portalProductDefinition(product: PortalProductSelection): PortalProductDefinition | undefined {
  return product.catalogKey ? CATALOG_BY_KEY.get(product.catalogKey) : undefined;
}

export function portalProjectLabel(products: PortalProductSelection[]): string {
  if (products.length !== 1) return "Project";
  return portalProductDefinition(products[0])?.projectLabel ?? products[0].name;
}

export function portalHomeHeading(products: PortalProductSelection[], override?: string): string {
  if (override?.trim()) return override.trim();
  if (products.length === 1) {
    return portalProductDefinition(products[0])?.homeHeading ?? `${products[0].name}, all in one place.`;
  }
  return products.length > 1 ? "Everything we are creating, in one place." : "Everything, beautifully in one place.";
}

export function portalStageFocus(
  product: PortalProductSelection,
  mode: "onboarding" | "designing" | "developed-launch" | "maintenance",
): string {
  return portalProductDefinition(product)?.stageFocus[mode]
    ?? (mode === "onboarding"
      ? `Share the details and references we need to begin ${product.name.toLowerCase()}.`
      : mode === "designing"
        ? `Review the current direction for ${product.name.toLowerCase()} and leave feedback.`
        : mode === "developed-launch"
          ? `Review the latest work for ${product.name.toLowerCase()} and confirm the final details.`
          : `Access delivered work and request support for ${product.name.toLowerCase()}.`);
}
