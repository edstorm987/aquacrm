import { portalStageFocus, type PortalProductKey, type PortalProductMode, type PortalProductSelection } from "./portalProducts";
import { BESPOKE_PRODUCT_MODULES } from "./portalBespokeProductModules";

export type PortalModuleActionTarget = "project" | "files" | "results" | "support" | "billing";
export type PortalModuleIcon = "activity" | "assets" | "calendar" | "checklist" | "delivery" | "insights" | "plan" | "review" | "settings" | "support";

export interface PortalProductModulePage {
  id: string;
  navLabel: string;
  icon: PortalModuleIcon;
  eyebrow: string;
  title: string;
  body: string;
  checklistTitle: string;
  checklist: string[];
  outputTitle: string;
  outputs: string[];
  actionLabel: string;
  actionTarget: PortalModuleActionTarget;
}

export interface PortalProductModule {
  label: string;
  shortLabel: string;
  promise: string;
  pages: PortalProductModulePage[];
}

export interface PortalProductLifecycleStage {
  label: string;
  eyebrow: string;
  heading: string;
  body: string;
  focus: string;
  progress: number;
  pageId: string;
  tasks: string[];
  actionLabel: string;
  actionTarget: PortalModuleActionTarget;
}

export const PORTAL_PROGRAMME_LIFECYCLE: Record<PortalProductMode, PortalProductLifecycleStage> = {
  onboarding: {
    label: "Programme setup",
    eyebrow: "Combined foundation",
    heading: "Bring every workstream into one clear programme.",
    body: "Align the shared outcome, specialist scopes, responsibilities, dependencies, inputs, commercial decisions, and timing before coordinated delivery begins.",
    focus: "Confirm the shared brief and make sure every specialist has the right context, access, files, and decision owner.",
    progress: 18,
    pageId: "project",
    tasks: ["Shared outcome agreed", "Specialist scopes aligned", "Dependencies mapped", "Decision owners confirmed"],
    actionLabel: "Review the programme brief",
    actionTarget: "project",
  },
  designing: {
    label: "Coordinated delivery",
    eyebrow: "Workstreams in motion",
    heading: "Keep specialist work moving together without losing clarity.",
    body: "Follow current work, cross-product dependencies, shared inputs, approvals, risks, and handoffs while each specialist system retains its own delivery rhythm.",
    focus: "Review the current stage inside each product system, then resolve the shared decisions that affect more than one workstream.",
    progress: 52,
    pageId: "project",
    tasks: ["Specialist progress reviewed", "Shared decisions resolved", "Dependencies kept current", "Next handoffs confirmed"],
    actionLabel: "Review active workstreams",
    actionTarget: "project",
  },
  "developed-launch": {
    label: "Combined delivery",
    eyebrow: "Joined-up review",
    heading: "Review the complete result as one connected experience.",
    body: "Bring specialist outputs together for integrated quality checks, final decisions, coordinated launch or handover, ownership, and a coherent client-facing result.",
    focus: "Complete each product’s delivery checks, then approve the integrated result and the sequence for launch or handover.",
    progress: 84,
    pageId: "project",
    tasks: ["Specialist outputs reviewed", "Integrated experience checked", "Final approvals recorded", "Handover sequence confirmed"],
    actionLabel: "Review combined delivery",
    actionTarget: "project",
  },
  maintenance: {
    label: "Programme care",
    eyebrow: "Ongoing relationship",
    heading: "Keep the complete client system useful after delivery.",
    body: "Return to every product’s delivered assets, results, support history, maintenance needs, and improvement opportunities through one continuing client relationship.",
    focus: "Use each product system for specialist support while shared files, billing, decisions, and programme priorities remain connected.",
    progress: 100,
    pageId: "project",
    tasks: ["Delivered systems kept accessible", "Support ownership maintained", "Cross-product changes coordinated", "Next opportunities reviewed"],
    actionLabel: "Open programme support",
    actionTarget: "support",
  },
};

const MODULES: Record<PortalProductKey, PortalProductModule> = {
  website: {
    label: "Website studio",
    shortLabel: "Website",
    promise: "Strategy, content, design, build, and launch remain visible as one connected website programme.",
    pages: [
      {
        id: "roadmap", navLabel: "Website roadmap", icon: "plan", eyebrow: "Website strategy", title: "The route from idea to launch.",
        body: "See the purpose, audience, structure, milestones, and decisions shaping the website before production moves ahead.",
        checklistTitle: "Foundation checklist", checklist: ["Business and audience goals agreed", "Page structure and conversion route mapped", "Content owners and dependencies confirmed", "Launch measure of success recorded"],
        outputTitle: "Roadmap outputs", outputs: ["Website brief", "Sitemap", "Conversion plan", "Delivery timeline"], actionLabel: "Open website brief", actionTarget: "project",
      },
      {
        id: "content-design", navLabel: "Content & design", icon: "review", eyebrow: "Creative production", title: "Words and design, reviewed together.",
        body: "Keep page content, visual direction, references, feedback, and approvals attached to the exact experience being made.",
        checklistTitle: "Review flow", checklist: ["Priority page copy supplied", "Visual references shared", "Design direction reviewed", "Focused feedback returned"],
        outputTitle: "Creative outputs", outputs: ["Page copy", "Wireframes", "Visual system", "Approved page designs"], actionLabel: "Share content or feedback", actionTarget: "files",
      },
      {
        id: "launch", navLabel: "Launch centre", icon: "delivery", eyebrow: "Build and launch", title: "A controlled path to going live.",
        body: "Track the working build, final checks, domain readiness, approvals, handover, and what happens immediately after launch.",
        checklistTitle: "Launch readiness", checklist: ["Responsive build reviewed", "Forms and key journeys tested", "Domain and analytics prepared", "Final launch approval recorded"],
        outputTitle: "Launch outputs", outputs: ["Working website", "QA record", "Launch checklist", "Handover notes"], actionLabel: "Review connected work", actionTarget: "project",
      },
    ],
  },
  "brand-identity": {
    label: "Brand studio",
    shortLabel: "Brand",
    promise: "Strategy, identity development, decisions, and final brand assets live in one deliberate creative system.",
    pages: [
      {
        id: "direction", navLabel: "Brand direction", icon: "plan", eyebrow: "Strategic foundation", title: "Define what the brand must mean.",
        body: "Bring the audience, position, personality, references, and creative territory together before visual routes are developed.",
        checklistTitle: "Direction checklist", checklist: ["Audience and positioning clarified", "Brand personality articulated", "Competitor context reviewed", "Creative territory agreed"],
        outputTitle: "Direction outputs", outputs: ["Brand brief", "Positioning summary", "Mood direction", "Creative principles"], actionLabel: "Complete brand brief", actionTarget: "project",
      },
      {
        id: "identity-review", navLabel: "Identity review", icon: "review", eyebrow: "Identity development", title: "Review the system, not just a logo.",
        body: "Assess identity routes across real applications, record focused feedback, and keep every approval attached to the chosen direction.",
        checklistTitle: "Review sequence", checklist: ["Identity routes presented", "Applications reviewed in context", "Feedback consolidated", "Final direction approved"],
        outputTitle: "Identity outputs", outputs: ["Logo family", "Colour system", "Typography direction", "Graphic language"], actionLabel: "Share identity feedback", actionTarget: "support",
      },
      {
        id: "brand-kit", navLabel: "Brand kit", icon: "assets", eyebrow: "Final identity", title: "Every brand asset, ready to use.",
        body: "Access the approved identity system, practical guidance, export formats, and the files needed to apply the brand consistently.",
        checklistTitle: "Handover checklist", checklist: ["Final artwork checked", "Usage guidance prepared", "Export formats organised", "Brand kit delivered"],
        outputTitle: "Brand kit contents", outputs: ["Master logos", "Colour values", "Font guidance", "Brand guidelines"], actionLabel: "Open brand files", actionTarget: "files",
      },
    ],
  },
  photography: {
    label: "Photography studio",
    shortLabel: "Photography",
    promise: "Planning, production, selection, retouching, and final image delivery stay connected from first brief to gallery.",
    pages: [
      {
        id: "shoot-plan", navLabel: "Shoot plan", icon: "calendar", eyebrow: "Production planning", title: "Make the shoot day effortless.",
        body: "Coordinate the purpose, people, locations, timings, usage, styling, logistics, and contingencies before cameras arrive.",
        checklistTitle: "Pre-production", checklist: ["Shoot objective and usage confirmed", "Date, location, and access agreed", "People and permissions organised", "Styling and logistics checked"],
        outputTitle: "Planning outputs", outputs: ["Production brief", "Call sheet", "Location plan", "Usage notes"], actionLabel: "Review the shoot brief", actionTarget: "project",
      },
      {
        id: "shot-list", navLabel: "Shot list", icon: "checklist", eyebrow: "Creative coverage", title: "Every essential frame accounted for.",
        body: "Keep priority images, scenes, people, formats, references, and campaign uses in one shared coverage plan.",
        checklistTitle: "Coverage plan", checklist: ["Hero images prioritised", "People and groupings listed", "Landscape and portrait needs marked", "Campaign crops and formats noted"],
        outputTitle: "Creative references", outputs: ["Shot list", "Mood references", "Framing notes", "Priority order"], actionLabel: "Share visual references", actionTarget: "files",
      },
      {
        id: "gallery", navLabel: "Selection & gallery", icon: "assets", eyebrow: "Image delivery", title: "From selects to a finished image library.",
        body: "Review selections, consolidate retouching notes, approve the final set, and access delivered image formats from one place.",
        checklistTitle: "Delivery flow", checklist: ["Contact selection reviewed", "Retouching notes consolidated", "Final images approved", "Usage-ready gallery delivered"],
        outputTitle: "Gallery outputs", outputs: ["Curated selects", "Retouched masters", "Web exports", "Print-ready files"], actionLabel: "Open photography files", actionTarget: "files",
      },
    ],
  },
  "google-profile": {
    label: "Local visibility hub",
    shortLabel: "Google Profile",
    promise: "Profile accuracy, local content, reputation, and visibility improvements become one maintainable local-growth system.",
    pages: [
      {
        id: "profile", navLabel: "Profile foundation", icon: "settings", eyebrow: "Google Business Profile", title: "A complete, trustworthy local presence.",
        body: "Control core business details, categories, services, locations, imagery, access, and verification readiness in one place.",
        checklistTitle: "Profile foundation", checklist: ["Ownership and access confirmed", "Business details checked", "Categories and services aligned", "Locations and service areas verified"],
        outputTitle: "Profile outputs", outputs: ["Optimised profile", "Service structure", "Business description", "Image plan"], actionLabel: "Review business details", actionTarget: "project",
      },
      {
        id: "local-content", navLabel: "Local content", icon: "calendar", eyebrow: "Profile activity", title: "Keep the profile useful and current.",
        body: "Plan updates, offers, service imagery, questions, seasonal moments, and local proof without losing momentum.",
        checklistTitle: "Publishing rhythm", checklist: ["Priority services represented", "Fresh imagery prepared", "Updates scheduled", "Questions and answers reviewed"],
        outputTitle: "Content outputs", outputs: ["Profile posts", "Service imagery", "Offer updates", "Q&A guidance"], actionLabel: "Share profile content", actionTarget: "files",
      },
      {
        id: "reputation", navLabel: "Reviews & visibility", icon: "insights", eyebrow: "Local reputation", title: "Turn trust into measurable visibility.",
        body: "Monitor reviews, response quality, discovery activity, local actions, and the next improvements that strengthen trust.",
        checklistTitle: "Reputation routine", checklist: ["Review request route prepared", "Response approach agreed", "New reviews monitored", "Visibility actions reviewed"],
        outputTitle: "Visibility signals", outputs: ["Review health", "Response record", "Profile actions", "Improvement priorities"], actionLabel: "View visibility results", actionTarget: "results",
      },
    ],
  },
  content: {
    label: "Content engine",
    shortLabel: "Content",
    promise: "Ideas, briefs, production, feedback, approvals, publishing, and learning operate as one repeatable content engine.",
    pages: [
      {
        id: "plan", navLabel: "Content plan", icon: "calendar", eyebrow: "Editorial direction", title: "Know what to publish and why.",
        body: "Connect audience needs, commercial priorities, themes, channels, formats, and publishing cadence into a practical plan.",
        checklistTitle: "Planning system", checklist: ["Audience questions captured", "Commercial themes prioritised", "Channels and formats chosen", "Publishing rhythm agreed"],
        outputTitle: "Planning outputs", outputs: ["Content pillars", "Editorial calendar", "Campaign briefs", "Channel plan"], actionLabel: "Review content priorities", actionTarget: "project",
      },
      {
        id: "review", navLabel: "Review queue", icon: "review", eyebrow: "Content production", title: "A clean route from draft to approval.",
        body: "Review working content, leave consolidated notes, resolve decisions, and keep every approved asset connected to its purpose.",
        checklistTitle: "Review workflow", checklist: ["Brief accepted", "Draft supplied", "Feedback consolidated", "Final content approved"],
        outputTitle: "Production outputs", outputs: ["Working drafts", "Creative assets", "Review notes", "Approved masters"], actionLabel: "Send review feedback", actionTarget: "support",
      },
      {
        id: "publishing", navLabel: "Publishing & learning", icon: "activity", eyebrow: "Distribution", title: "Publish, learn, and improve the next cycle.",
        body: "Track what is ready, what has gone live, how it performed, and what the evidence says should be created next.",
        checklistTitle: "Publishing cycle", checklist: ["Final formats prepared", "Publishing details confirmed", "Content released", "Performance reviewed"],
        outputTitle: "Learning outputs", outputs: ["Published content", "Distribution record", "Performance signals", "Next-cycle ideas"], actionLabel: "Review content results", actionTarget: "results",
      },
    ],
  },
  automation: {
    label: "Automation control room",
    shortLabel: "Automation",
    promise: "Process discovery, automation logic, exceptions, testing, monitoring, and improvement live in one controlled system.",
    pages: [
      {
        id: "workflow-map", navLabel: "Workflow map", icon: "plan", eyebrow: "Process design", title: "See the process before automating it.",
        body: "Map triggers, people, tools, data, handoffs, decisions, delays, and failure points before the new workflow is built.",
        checklistTitle: "Discovery checklist", checklist: ["Current workflow mapped", "Triggers and owners confirmed", "Exceptions documented", "Success measures agreed"],
        outputTitle: "Mapping outputs", outputs: ["Current-state map", "Future workflow", "Data requirements", "Exception register"], actionLabel: "Open workflow brief", actionTarget: "project",
      },
      {
        id: "test-centre", navLabel: "Test centre", icon: "checklist", eyebrow: "Automation assurance", title: "Prove every path before switching on.",
        body: "Run realistic scenarios, inspect edge cases, confirm notifications, validate data, and record acceptance before release.",
        checklistTitle: "Test sequence", checklist: ["Happy path passed", "Exceptions exercised", "Data outputs checked", "Owner acceptance recorded"],
        outputTitle: "Test outputs", outputs: ["Scenario matrix", "Issue record", "Acceptance notes", "Go-live decision"], actionLabel: "Report a test result", actionTarget: "support",
      },
      {
        id: "runbook", navLabel: "Runbook & monitoring", icon: "activity", eyebrow: "Live operations", title: "Keep the automation healthy after launch.",
        body: "Understand ownership, monitoring, alerts, recovery, change control, and the improvement queue for every live workflow.",
        checklistTitle: "Operational readiness", checklist: ["Monitoring enabled", "Failure alerts routed", "Recovery steps documented", "Improvement owner assigned"],
        outputTitle: "Operational outputs", outputs: ["Live runbook", "Monitoring view", "Recovery guide", "Change log"], actionLabel: "Request an automation change", actionTarget: "support",
      },
    ],
  },
  "custom-software": {
    label: "Product workspace",
    shortLabel: "Software",
    promise: "Product intent, user journeys, feature decisions, releases, issues, and future improvements stay joined throughout delivery.",
    pages: [
      {
        id: "roadmap", navLabel: "Product roadmap", icon: "plan", eyebrow: "Product definition", title: "Build the right product in the right order.",
        body: "Keep users, jobs, requirements, risks, priorities, milestones, and success measures visible as the product takes shape.",
        checklistTitle: "Definition checklist", checklist: ["Users and jobs understood", "Core journeys mapped", "Release scope prioritised", "Success measures recorded"],
        outputTitle: "Product outputs", outputs: ["Product brief", "Journey map", "Prioritised backlog", "Release roadmap"], actionLabel: "Open product brief", actionTarget: "project",
      },
      {
        id: "feature-review", navLabel: "Feature review", icon: "review", eyebrow: "Design and development", title: "Review working journeys, not isolated screens.",
        body: "Explore features in context, record precise feedback, resolve product decisions, and keep acceptance attached to each journey.",
        checklistTitle: "Review workflow", checklist: ["Prototype or build available", "Core journeys exercised", "Feedback consolidated", "Acceptance decision recorded"],
        outputTitle: "Review outputs", outputs: ["Working preview", "Decision log", "Issue queue", "Accepted features"], actionLabel: "Open connected build", actionTarget: "project",
      },
      {
        id: "release", navLabel: "Release centre", icon: "delivery", eyebrow: "Release management", title: "Move from tested build to dependable product.",
        body: "Coordinate release readiness, data, access, quality, deployment, handover, known issues, and the next product iteration.",
        checklistTitle: "Release readiness", checklist: ["Acceptance tests passed", "Access and data prepared", "Deployment plan confirmed", "Handover and support ready"],
        outputTitle: "Release outputs", outputs: ["Production release", "Release notes", "Known-issue record", "Support plan"], actionLabel: "Review release status", actionTarget: "project",
      },
    ],
  },
  "social-ads": {
    label: "Social growth studio",
    shortLabel: "Social & ads",
    promise: "Channel access, content production, client approvals, paid acquisition and commercial results stay visible in one continuing growth system.",
    pages: [
      {
        id: "channel-strategy", navLabel: "Channel strategy", icon: "plan", eyebrow: "Growth foundation", title: "Put every channel behind one commercial direction.",
        body: "Keep the audience, offer, content pillars, platform roles, account access, budgets, exclusions and success measures agreed before production begins.",
        checklistTitle: "Strategy foundation", checklist: ["Priority audience agreed", "Channel roles defined", "Account access connected", "Goals and budget guardrails recorded"],
        outputTitle: "Strategy outputs", outputs: ["Audience definition", "Channel plan", "Content pillars", "Media budget"], actionLabel: "Review growth brief", actionTarget: "project",
      },
      {
        id: "content-approvals", navLabel: "Content & approvals", icon: "review", eyebrow: "Publishing operation", title: "See what is being made, what needs a decision and what goes live next.",
        body: "Review ideas, scripts, creative, captions, formats, scheduled dates and feedback through a precise approval trail shared with the delivery team.",
        checklistTitle: "Publishing workflow", checklist: ["Content queue planned", "Creative produced", "Client decisions recorded", "Publishing dates confirmed"],
        outputTitle: "Content outputs", outputs: ["Content calendar", "Approved creative", "Publishing queue", "Decision history"], actionLabel: "Open content queue", actionTarget: "project",
      },
      {
        id: "campaign-results", navLabel: "Campaign results", icon: "insights", eyebrow: "Paid acquisition", title: "Know what the media spend is producing.",
        body: "Follow budget, spend, impressions, clicks, leads, conversions, attributed revenue, cost per lead and return on ad spend without vague performance claims.",
        checklistTitle: "Campaign assurance", checklist: ["Tracking verified", "Creative approved", "Budget pacing checked", "Results reviewed against target"],
        outputTitle: "Performance outputs", outputs: ["Campaign register", "Attribution record", "Performance report", "Optimisation plan"], actionLabel: "Review campaign evidence", actionTarget: "results",
      },
    ],
  },
  "ongoing-care": {
    label: "Care desk",
    shortLabel: "Care",
    promise: "Support, monitoring, maintenance, service health, requests, and continuous improvement become one dependable care relationship.",
    pages: [
      {
        id: "health", navLabel: "Service health", icon: "activity", eyebrow: "Live service", title: "A clear view of what is being looked after.",
        body: "See monitored properties, current service condition, recent activity, known risks, and the maintenance priorities that matter now.",
        checklistTitle: "Care baseline", checklist: ["Live properties connected", "Access confirmed", "Monitoring coverage agreed", "Priority risks recorded"],
        outputTitle: "Health outputs", outputs: ["Service baseline", "Monitoring status", "Risk register", "Maintenance record"], actionLabel: "View service results", actionTarget: "results",
      },
      {
        id: "requests", navLabel: "Request queue", icon: "support", eyebrow: "Priority support", title: "Every request, with its full context.",
        body: "Submit changes, questions, issues, and ideas; follow their status without fragmenting the history across messages and email.",
        checklistTitle: "Request handling", checklist: ["Request captured clearly", "Priority understood", "Owner assigned", "Resolution recorded"],
        outputTitle: "Support record", outputs: ["Open requests", "Responses", "Resolved work", "Decision history"], actionLabel: "Open support request", actionTarget: "support",
      },
      {
        id: "improvements", navLabel: "Improvement plan", icon: "plan", eyebrow: "Continuous improvement", title: "Turn maintenance into forward movement.",
        body: "Keep opportunities, enhancements, evidence, priorities, and agreed next work visible beyond day-to-day support.",
        checklistTitle: "Improvement cycle", checklist: ["Opportunities collected", "Impact assessed", "Priorities agreed", "Next improvement scheduled"],
        outputTitle: "Improvement outputs", outputs: ["Opportunity backlog", "Priority plan", "Change releases", "Outcome review"], actionLabel: "Suggest an improvement", actionTarget: "support",
      },
    ],
  },
  "business-os": {
    label: "Business command centre",
    shortLabel: "Business OS",
    promise: "The business picture, priorities, objectives, decisions, actions, and review rhythm become one usable operating system.",
    pages: [
      {
        id: "business-picture", navLabel: "Business picture", icon: "insights", eyebrow: "Executive view", title: "See the business as it really is.",
        body: "Bring the model, position, customers, offer, finances, capacity, risks, and opportunities into one honest operating picture.",
        checklistTitle: "Business snapshot", checklist: ["Business model captured", "Commercial position reviewed", "Capacity and constraints understood", "Risks and opportunities recorded"],
        outputTitle: "Snapshot outputs", outputs: ["Business map", "Health assessment", "Constraint register", "Opportunity picture"], actionLabel: "Complete business snapshot", actionTarget: "project",
      },
      {
        id: "priorities", navLabel: "Objectives & priorities", icon: "plan", eyebrow: "Strategic direction", title: "Choose what matters and make it measurable.",
        body: "Connect objectives, targets, key results, initiatives, ownership, dependencies, and trade-offs into a focused plan.",
        checklistTitle: "Priority discipline", checklist: ["Objectives agreed", "Measures and targets defined", "Initiatives prioritised", "Owners and review dates set"],
        outputTitle: "Planning outputs", outputs: ["Objective set", "KPI scorecard", "Priority roadmap", "Decision record"], actionLabel: "Review current priorities", actionTarget: "project",
      },
      {
        id: "action-plan", navLabel: "Execution rhythm", icon: "checklist", eyebrow: "Operating cadence", title: "Turn direction into repeated execution.",
        body: "Keep commitments, weekly actions, review questions, progress, blockers, and the next decision connected to the strategy.",
        checklistTitle: "Execution rhythm", checklist: ["Weekly commitments visible", "Progress reviewed", "Blockers escalated", "Next decisions recorded"],
        outputTitle: "Execution outputs", outputs: ["90-day plan", "Weekly actions", "Review notes", "Progress record"], actionLabel: "Open action workspace", actionTarget: "project",
      },
    ],
  },
  "health-check": {
    label: "Digital health centre",
    shortLabel: "Health check",
    promise: "Evidence, findings, risks, opportunities, recommendations, and follow-through form one clear digital improvement system.",
    pages: [
      {
        id: "assessment", navLabel: "Assessment scope", icon: "checklist", eyebrow: "Digital assessment", title: "Define exactly what is being examined.",
        body: "Connect business context, digital properties, access, evidence, questions, benchmarks, and known concerns before the review begins.",
        checklistTitle: "Assessment setup", checklist: ["Business context supplied", "Digital properties listed", "Required access confirmed", "Known concerns documented"],
        outputTitle: "Assessment inputs", outputs: ["Review scope", "Property inventory", "Evidence pack", "Benchmark context"], actionLabel: "Complete assessment brief", actionTarget: "project",
      },
      {
        id: "findings", navLabel: "Findings", icon: "insights", eyebrow: "Evidence and diagnosis", title: "Understand what is helping and what is holding back growth.",
        body: "Review strengths, gaps, risks, friction, missed opportunities, and supporting evidence across the assessed digital estate.",
        checklistTitle: "Finding quality", checklist: ["Evidence collected", "Impact explained", "Risk level assigned", "Business context considered"],
        outputTitle: "Finding groups", outputs: ["Strengths", "Priority issues", "Quick wins", "Structural opportunities"], actionLabel: "Review supporting evidence", actionTarget: "files",
      },
      {
        id: "recommendations", navLabel: "Recommendations", icon: "plan", eyebrow: "Prioritised improvement", title: "Move from findings to a practical sequence.",
        body: "See recommended actions ordered by impact, effort, dependency, urgency, ownership, and the evidence needed to prove improvement.",
        checklistTitle: "Recommendation test", checklist: ["Impact and effort compared", "Dependencies identified", "Owners proposed", "Measurement approach defined"],
        outputTitle: "Action outputs", outputs: ["Prioritised roadmap", "Quick-win plan", "Investment options", "Measurement framework"], actionLabel: "Discuss next actions", actionTarget: "support",
      },
    ],
  },
};

export function portalProductModule(product: PortalProductSelection): PortalProductModule {
  if (product.catalogKey) return MODULES[product.catalogKey];
  const bespokeModule = BESPOKE_PRODUCT_MODULES[product.name.trim().toLowerCase()];
  if (bespokeModule) return bespokeModule;
  const deliverables = product.deliverables.length ? product.deliverables : ["Agreed scope", "Working delivery", "Final handover"];
  return {
    label: `${product.name} workspace`,
    shortLabel: product.name,
    promise: product.description || `${product.name} planned, delivered, reviewed, and supported through one connected client workspace.`,
    pages: [
      {
        id: "plan", navLabel: `${product.name} plan`, icon: "plan", eyebrow: "Service plan", title: `A clear route through ${product.name.toLowerCase()}.`,
        body: "See the agreed purpose, scope, responsibilities, milestones, dependencies, and decisions before delivery moves forward.",
        checklistTitle: "Planning checklist", checklist: ["Outcome agreed", "Scope confirmed", "Inputs collected", "Milestones planned"],
        outputTitle: "Planned outputs", outputs: deliverables.slice(0, 4), actionLabel: "Open service brief", actionTarget: "project",
      },
      {
        id: "workspace", navLabel: "Working space", icon: "review", eyebrow: "Work in progress", title: `${product.name} in motion.`,
        body: "Keep current work, references, feedback, decisions, and approvals attached to the delivery as it develops.",
        checklistTitle: "Working rhythm", checklist: ["Current work shared", "Feedback consolidated", "Decisions recorded", "Next move confirmed"],
        outputTitle: "Working outputs", outputs: deliverables.slice(0, 4), actionLabel: "Share files or feedback", actionTarget: "files",
      },
      {
        id: "delivery", navLabel: "Delivery & support", icon: "delivery", eyebrow: "Final delivery", title: `${product.name}, ready to use.`,
        body: "Review final outputs, handover material, acceptance, support, and the next opportunities after delivery.",
        checklistTitle: "Delivery checklist", checklist: ["Outputs reviewed", "Final changes resolved", "Handover completed", "Support route confirmed"],
        outputTitle: "Final outputs", outputs: deliverables.slice(0, 4), actionLabel: "Open support", actionTarget: "support",
      },
    ],
  };
}

export function portalProductModulePage(product: PortalProductSelection, pageId?: string): PortalProductModulePage {
  const module = portalProductModule(product);
  return module.pages.find(page => page.id === pageId) ?? module.pages[0];
}

export function portalProductLifecycle(product: PortalProductSelection): Record<PortalProductMode, PortalProductLifecycleStage> {
  const module = portalProductModule(product);
  const [foundation, working, delivery] = module.pages;
  const configuredFocus = (mode: PortalProductMode, page: PortalProductModulePage) => {
    const override = product.stageFocusOverrides?.[mode]?.trim();
    if (override || product.catalogKey) return override || portalStageFocus(product, mode);
    if (mode === "onboarding") return `Open ${page.navLabel} and work through the ${page.checklistTitle.toLowerCase()}, beginning with “${page.checklist[0]}”.`;
    if (mode === "designing") return `Use ${page.navLabel} to review the ${page.outputTitle.toLowerCase()}, beginning with “${page.checklist[0]}”, then return one consolidated decision.`;
    if (mode === "developed-launch") return `Prepare the ${page.outputTitle.toLowerCase()} by resolving the ${page.checklistTitle.toLowerCase()}, beginning with “${page.checklist[0]}”.`;
    return `Use ${module.label} to keep ${delivery.outputs.slice(0, 2).map(item => item.toLowerCase()).join(" and ")} current, request support, and plan the next improvement.`;
  };
  const ongoingTasks = [
    `Keep ${delivery.outputs[0].toLowerCase()} accessible and current`,
    `Review ${delivery.outputs[1].toLowerCase()} when the service changes`,
    `Use the shared support record for ${module.shortLabel.toLowerCase()} requests`,
    `Plan the next ${module.shortLabel.toLowerCase()} improvement from real evidence`,
  ];

  return {
    onboarding: {
      label: foundation.navLabel,
      eyebrow: foundation.eyebrow,
      heading: foundation.title,
      body: foundation.body,
      focus: configuredFocus("onboarding", foundation),
      progress: 18,
      pageId: foundation.id,
      tasks: foundation.checklist,
      actionLabel: foundation.actionLabel,
      actionTarget: foundation.actionTarget,
    },
    designing: {
      label: working.navLabel,
      eyebrow: working.eyebrow,
      heading: working.title,
      body: working.body,
      focus: configuredFocus("designing", working),
      progress: 52,
      pageId: working.id,
      tasks: working.checklist,
      actionLabel: working.actionLabel,
      actionTarget: working.actionTarget,
    },
    "developed-launch": {
      label: delivery.navLabel,
      eyebrow: delivery.eyebrow,
      heading: delivery.title,
      body: delivery.body,
      focus: configuredFocus("developed-launch", delivery),
      progress: 84,
      pageId: delivery.id,
      tasks: delivery.checklist,
      actionLabel: delivery.actionLabel,
      actionTarget: delivery.actionTarget,
    },
    maintenance: {
      label: `${module.shortLabel} care`,
      eyebrow: "Ongoing relationship",
      heading: `${module.shortLabel}, supported and improving after delivery.`,
      body: `Return to ${delivery.navLabel.toLowerCase()}, shared files, decisions, results, and support whenever ${module.shortLabel.toLowerCase()} needs attention or a new opportunity appears.`,
      focus: configuredFocus("maintenance", delivery),
      progress: 100,
      pageId: delivery.id,
      tasks: ongoingTasks,
      actionLabel: product.supportCta?.trim() || `Request ${module.shortLabel.toLowerCase()} support`,
      actionTarget: "support",
    },
  };
}
