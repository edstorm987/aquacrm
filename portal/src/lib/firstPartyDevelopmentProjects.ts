export type FirstPartyProjectKind =
  | "website"
  | "client-portal"
  | "software"
  | "lead-magnet"
  | "template";

export interface FirstPartyDevelopmentProject {
  id: string;
  name: string;
  brand: string;
  folder: string;
  kind: FirstPartyProjectKind;
  status: "planning" | "building" | "review" | "live";
  description: string;
  publicUrl: string;
  previewUrl: string;
  sourcePath: string;
  repositoryUrl: string;
  tags: readonly string[];
  telemetrySiteKey?: string;
  telemetryPropertyId?: string;
  tagInstalled?: boolean;
}

const ecosystemRoot = "/Users/eds/Desktop/Projects/Web Development/Personal EcoSystem";

export const FIRST_PARTY_DEVELOPMENT_PROJECTS: readonly FirstPartyDevelopmentProject[] = [
  {
    id: "aquacrm-website",
    name: "AquaCRM website",
    brand: "AquaCRM",
    folder: "aquaCRM/website",
    kind: "website",
    status: "live",
    description: "The public software-company website, project portfolio and route into the AquaCRM platform.",
    publicUrl: "https://aqua-crm.com",
    previewUrl: "http://localhost:3040",
    sourcePath: `${ecosystemRoot}/aquaCRM/website`,
    repositoryUrl: "https://github.com/edstorm987/aquacrm",
    tags: ["public", "software", "portfolio", "production"],
    telemetrySiteKey: "aqua_public_aquacrm_v1",
    telemetryPropertyId: "aquacrm",
    tagInstalled: true,
  },
  {
    id: "aquacrm-platform",
    name: "AquaCRM platform",
    brand: "AquaCRM",
    folder: "aquaCRM/portal",
    kind: "software",
    status: "live",
    description: "The unified internal operating system for leads, clients, delivery, finance, support and development.",
    publicUrl: "https://aqua-crm.com/portal/agency",
    previewUrl: "http://localhost:3032/portal/agency",
    sourcePath: `${ecosystemRoot}/aquaCRM/portal`,
    repositoryUrl: "https://github.com/edstorm987/aquacrm",
    tags: ["internal", "crm", "operations", "supabase"],
  },
  {
    id: "aquacrm-client-portal",
    name: "Client portal shell",
    brand: "AquaCRM",
    folder: "aquaCRM/client-portal",
    kind: "client-portal",
    status: "building",
    description: "The reusable branded client-facing shell used while custom products are being delivered.",
    publicUrl: "https://aqua-crm.com/login?brand=aquacrm&next=/portal/customer",
    previewUrl: "http://localhost:3032/login?brand=aquacrm&next=/portal/customer",
    sourcePath: `${ecosystemRoot}/aquaCRM/client-portal`,
    repositoryUrl: "https://github.com/edstorm987/aquacrm",
    tags: ["client-facing", "portal", "authentication"],
  },
  {
    id: "aquacrm-templates",
    name: "Development templates",
    brand: "AquaCRM",
    folder: "aquaCRM/github-templates",
    kind: "template",
    status: "building",
    description: "Reusable starters and modules for faster client delivery without coupling client repositories together.",
    publicUrl: "https://github.com/edstorm987/aquacrm",
    previewUrl: "http://localhost:3032/portal/agency/development/toolkit",
    sourcePath: `${ecosystemRoot}/aquaCRM/github-templates`,
    repositoryUrl: "https://github.com/edstorm987/aquacrm",
    tags: ["internal", "templates", "starters", "modules"],
  },
  {
    id: "aquaoasis-web",
    name: "AquaOasis-Web website",
    brand: "AquaOasis-Web",
    folder: "aquaoasis-web/website",
    kind: "website",
    status: "live",
    description: "The marketing, websites, visibility and joined-up digital services business.",
    publicUrl: "https://aquaoasis-web.com",
    previewUrl: "http://localhost:3034",
    sourcePath: `${ecosystemRoot}/aquaoasis-web/website`,
    repositoryUrl: "https://github.com/edstorm987/aquaoasis-web.com",
    tags: ["public", "marketing", "websites", "production"],
    telemetrySiteKey: "aqua_public_aquaoasis_web_v1",
    telemetryPropertyId: "aquaoasis-web",
    tagInstalled: true,
  },
  {
    id: "milesymedia-website",
    name: "Milesymedia website",
    brand: "Milesymedia",
    folder: "milesymedia/website",
    kind: "website",
    status: "review",
    description: "The photography, video, drone and creative production concept website.",
    publicUrl: "https://milesymedia.com",
    previewUrl: "http://localhost:3030",
    sourcePath: `${ecosystemRoot}/milesymedia/website`,
    repositoryUrl: "https://github.com/edstorm987/milesymedia-photography-brand",
    tags: ["public", "media", "photography", "concept"],
    telemetrySiteKey: "aqua_public_milesymedia_v1",
    telemetryPropertyId: "milesymedia",
    tagInstalled: true,
  },
  {
    id: "zimante-group",
    name: "Zimante Group website",
    brand: "Zimante Group",
    folder: "zimante/website",
    kind: "website",
    status: "live",
    description: "The parent-company website connecting the group, specialist brands and cross-company enquiries.",
    publicUrl: "https://zimante-group.com",
    previewUrl: "http://localhost:3033",
    sourcePath: `${ecosystemRoot}/zimante/website`,
    repositoryUrl: "https://github.com/edstorm987/zimante-group",
    tags: ["public", "group", "directory", "production"],
    telemetrySiteKey: "aqua_public_zimante_group_v1",
    telemetryPropertyId: "zimante-group",
    tagInstalled: true,
  },
  {
    id: "edward-hallam",
    name: "Edward Hallam website",
    brand: "Edward Hallam",
    folder: "edward-hallam.com",
    kind: "website",
    status: "live",
    description: "The personal website and trusted route into the ecosystem companies and their services.",
    publicUrl: "https://edward-hallam.com",
    previewUrl: "https://edward-hallam.com",
    sourcePath: `${ecosystemRoot}/edward-hallam.com`,
    repositoryUrl: "https://github.com/edstorm987/edward-hallam.com",
    tags: ["public", "personal", "directory", "production"],
    telemetrySiteKey: "aqua_public_edward_hallam_v1",
    telemetryPropertyId: "edward-hallam",
    tagInstalled: true,
  },
  {
    id: "business-os",
    name: "Business OS",
    brand: "AquaOasis-Web",
    folder: "aquaCRM/portal/public/business-os",
    kind: "lead-magnet",
    status: "building",
    description: "The operating-system lead magnet and guided business workspace.",
    publicUrl: "https://aqua-crm.com/business-os",
    previewUrl: "http://localhost:3032/business-os",
    sourcePath: `${ecosystemRoot}/aquaCRM/portal/public/business-os`,
    repositoryUrl: "https://github.com/edstorm987/aquacrm",
    tags: ["lead-magnet", "business", "interactive"],
    telemetrySiteKey: "aqua_public_aquacrm_v1",
    telemetryPropertyId: "business-os",
    tagInstalled: true,
  },
  {
    id: "health-check",
    name: "Business Health Check",
    brand: "AquaOasis-Web",
    folder: "aquaCRM/portal/public/health-check",
    kind: "lead-magnet",
    status: "building",
    description: "The interactive diagnostic used for lead qualification and practical recommendations.",
    publicUrl: "https://aqua-crm.com/health-check",
    previewUrl: "http://localhost:3032/health-check",
    sourcePath: `${ecosystemRoot}/aquaCRM/portal/public/health-check`,
    repositoryUrl: "https://github.com/edstorm987/aquacrm",
    tags: ["lead-magnet", "diagnostic", "interactive"],
    telemetrySiteKey: "aqua_public_aquacrm_v1",
    telemetryPropertyId: "health-check",
    tagInstalled: true,
  },
];

export function getFirstPartyDevelopmentProject(id: string) {
  return FIRST_PARTY_DEVELOPMENT_PROJECTS.find(project => project.id === id);
}
