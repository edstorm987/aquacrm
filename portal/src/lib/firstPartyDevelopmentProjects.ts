export type FirstPartyProjectKind = "website" | "software" | "lead-magnet";

export interface FirstPartyDevelopmentProject {
  id: string;
  name: string;
  kind: FirstPartyProjectKind;
  status: "planning" | "building" | "review" | "live";
  description: string;
  publicUrl: string;
  previewUrl: string;
  sourcePath: string;
  repositoryUrl: string;
}

const previewHost = "http://localhost:3031";
const websiteSource = "../milesymedia-website";
const repositoryUrl = "https://github.com/edstorm987/milesymedia-website";

export const FIRST_PARTY_DEVELOPMENT_PROJECTS: readonly FirstPartyDevelopmentProject[] = [
  {
    id: "milesymedia-website",
    name: "Milesymedia website",
    kind: "website",
    status: "building",
    description: "The full Milesymedia marketing website behind the public redesign gate.",
    publicUrl: "/",
    previewUrl: `${previewHost}/development-preview/site`,
    sourcePath: websiteSource,
    repositoryUrl,
  },
  {
    id: "milesymedia-portal",
    name: "AquaCRM",
    kind: "software",
    status: "building",
    description: "The internal agency operating system and client portal platform.",
    publicUrl: "/portal/agency",
    previewUrl: "/portal/agency",
    sourcePath: ".",
    repositoryUrl: "https://github.com/edstorm987/aquacrm",
  },
  {
    id: "business-os",
    name: "Business OS",
    kind: "lead-magnet",
    status: "building",
    description: "The free operating layer and lead-magnet application.",
    publicUrl: "/",
    previewUrl: `${previewHost}/business-os/app.html?preview=portal`,
    sourcePath: `${websiteSource}/public/business-os`,
    repositoryUrl,
  },
  {
    id: "health-check",
    name: "Health Check",
    kind: "lead-magnet",
    status: "building",
    description: "The interactive business diagnostic and lead qualification experience.",
    publicUrl: "/",
    previewUrl: `${previewHost}/health-check/index.html?preview=portal`,
    sourcePath: `${websiteSource}/public/health-check`,
    repositoryUrl,
  },
  {
    id: "seo-audit",
    name: "SEO audit",
    kind: "lead-magnet",
    status: "building",
    description: "A focused search visibility audit feeding the Milesymedia lead journey.",
    publicUrl: "/",
    previewUrl: `${previewHost}/resources/seo-audit?preview=portal`,
    sourcePath: `${websiteSource}/src/app/(website)/resources/seo-audit`,
    repositoryUrl,
  },
  {
    id: "site-speed",
    name: "Site speed test",
    kind: "lead-magnet",
    status: "building",
    description: "A performance check used as a practical website lead magnet.",
    publicUrl: "/",
    previewUrl: `${previewHost}/resources/site-speed?preview=portal`,
    sourcePath: `${websiteSource}/src/app/(website)/resources/site-speed`,
    repositoryUrl,
  },
  {
    id: "accessibility-audit",
    name: "Accessibility audit",
    kind: "lead-magnet",
    status: "building",
    description: "A WCAG-focused audit and entry point into accessibility work.",
    publicUrl: "/",
    previewUrl: `${previewHost}/resources/accessibility-audit?preview=portal`,
    sourcePath: `${websiteSource}/src/app/(website)/resources/accessibility-audit`,
    repositoryUrl,
  },
];

export function getFirstPartyDevelopmentProject(id: string) {
  return FIRST_PARTY_DEVELOPMENT_PROJECTS.find(project => project.id === id);
}
