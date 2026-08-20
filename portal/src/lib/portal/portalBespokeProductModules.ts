import type { PortalProductModule } from "@/lib/portal/portalProductModules";

export const BESPOKE_PRODUCT_MODULES: Record<string, PortalProductModule> = {
  "combined group project": {
    label: "Combined programme office",
    shortLabel: "Programme",
    promise: "Every specialist workstream is coordinated through one programme, one decision trail, and one joined-up client delivery.",
    pages: [
      {
        id: "programme-map", navLabel: "Programme map", icon: "plan", eyebrow: "Combined scope", title: "See how every specialist contribution fits together.",
        body: "Understand the shared outcome, participating teams, workstream boundaries, dependencies, responsibilities, and programme milestones before delivery begins.",
        checklistTitle: "Programme foundation", checklist: ["Shared outcome agreed", "Specialist scopes aligned", "Dependencies mapped", "Decision owners confirmed"],
        outputTitle: "Programme controls", outputs: ["Combined brief", "Workstream map", "Responsibility matrix", "Master timeline"], actionLabel: "Open combined brief", actionTarget: "project",
      },
      {
        id: "workstreams", navLabel: "Specialist workstreams", icon: "activity", eyebrow: "Coordinated delivery", title: "Follow every workstream without losing the whole picture.",
        body: "Track specialist progress, handoffs, shared inputs, current decisions, risks, and upcoming dependencies across one coordinated delivery view.",
        checklistTitle: "Coordination rhythm", checklist: ["Inputs shared once", "Handoffs scheduled", "Cross-team decisions resolved", "Risks reviewed together"],
        outputTitle: "Workstream record", outputs: ["Specialist updates", "Dependency log", "Shared decisions", "Risk actions"], actionLabel: "Review programme progress", actionTarget: "project",
      },
      {
        id: "combined-delivery", navLabel: "Combined delivery", icon: "delivery", eyebrow: "Joined-up handover", title: "Receive one coherent result from many disciplines.",
        body: "Review final specialist outputs, integrated quality checks, launch or handover readiness, ownership, and the next combined opportunity in one place.",
        checklistTitle: "Combined readiness", checklist: ["Specialist outputs complete", "Integrated experience checked", "Final decisions recorded", "Handover ownership agreed"],
        outputTitle: "Combined outputs", outputs: ["Integrated delivery", "Quality record", "Handover pack", "Next-phase plan"], actionLabel: "Open combined files", actionTarget: "files",
      },
    ],
  },
  "business and event photography": {
    label: "Commercial coverage studio",
    shortLabel: "Event media",
    promise: "Commercial intent, event logistics, priority moments, on-site coverage, and a campaign-ready image library stay connected.",
    pages: [
      {
        id: "production-plan", navLabel: "Production plan", icon: "calendar", eyebrow: "Commercial planning", title: "Prepare the people, place, and purpose before shoot day.",
        body: "Coordinate campaign goals, audience, venue access, schedule, contributors, permissions, brand requirements, and delivery deadlines before production.",
        checklistTitle: "Production readiness", checklist: ["Commercial use agreed", "Venue and access confirmed", "People and permissions arranged", "Delivery deadline recorded"],
        outputTitle: "Planning documents", outputs: ["Production brief", "Event schedule", "Access notes", "Usage plan"], actionLabel: "Review production brief", actionTarget: "project",
      },
      {
        id: "coverage-brief", navLabel: "Coverage brief", icon: "checklist", eyebrow: "Priority moments", title: "Make sure the business-critical moments are captured.",
        body: "Prioritise speakers, teams, guests, products, atmosphere, sponsor commitments, formats, and live-content needs in one practical coverage list.",
        checklistTitle: "Coverage priorities", checklist: ["Hero moments listed", "Key people identified", "Sponsor requirements marked", "Channel crops planned"],
        outputTitle: "Creative controls", outputs: ["Shot priority list", "People schedule", "Sponsor checklist", "Format guide"], actionLabel: "Share event references", actionTarget: "files",
      },
      {
        id: "event-gallery", navLabel: "Event gallery", icon: "assets", eyebrow: "Commercial delivery", title: "Move quickly from event coverage to usable campaign assets.",
        body: "Review selects, consolidate retouching notes, approve priority images, and access organised exports for press, social, web, and internal use.",
        checklistTitle: "Gallery delivery", checklist: ["Priority selects reviewed", "Retouching notes returned", "Usage sets organised", "Final gallery approved"],
        outputTitle: "Delivered library", outputs: ["Press selects", "Social exports", "Web gallery", "Archive masters"], actionLabel: "Open event files", actionTarget: "files",
      },
    ],
  },
  "staff and personal branding photography": {
    label: "Portrait direction studio",
    shortLabel: "Portraits",
    promise: "Personal positioning, team consistency, session direction, selections, and profile-ready delivery become one confident portrait system.",
    pages: [
      {
        id: "portrait-direction", navLabel: "Portrait direction", icon: "plan", eyebrow: "Personal positioning", title: "Define how every person should be seen and understood.",
        body: "Align roles, audiences, personality, brand context, wardrobe, locations, references, and intended profile uses before the session.",
        checklistTitle: "Direction checklist", checklist: ["People and roles listed", "Profile uses confirmed", "Visual tone agreed", "Wardrobe guidance shared"],
        outputTitle: "Direction outputs", outputs: ["Portrait brief", "Style direction", "Wardrobe notes", "Usage map"], actionLabel: "Review portrait brief", actionTarget: "project",
      },
      {
        id: "session-planner", navLabel: "Session planner", icon: "calendar", eyebrow: "Directed session", title: "Give every person a calm and properly planned session.",
        body: "Coordinate individual timings, group combinations, backgrounds, lighting changes, accessibility, privacy, and must-have frames without disruption.",
        checklistTitle: "Session readiness", checklist: ["Individual slots scheduled", "Group combinations mapped", "Location setup confirmed", "Must-have frames prioritised"],
        outputTitle: "Session controls", outputs: ["Session schedule", "People call sheet", "Group list", "Setup plan"], actionLabel: "Open session details", actionTarget: "project",
      },
      {
        id: "profile-library", navLabel: "Profile image library", icon: "assets", eyebrow: "Portrait delivery", title: "Put the right portrait in every professional context.",
        body: "Approve individual selections and access clearly named crops for websites, directories, proposals, press, speaking, LinkedIn, and internal systems.",
        checklistTitle: "Portrait handover", checklist: ["Individual selects approved", "Retouching requests resolved", "Required crops prepared", "People folders delivered"],
        outputTitle: "Profile formats", outputs: ["Individual portraits", "Team images", "Square profile crops", "High-resolution masters"], actionLabel: "Open portrait files", actionTarget: "files",
      },
    ],
  },
  "property media": {
    label: "Property media suite",
    shortLabel: "Property media",
    promise: "Property positioning, access, room coverage, exterior conditions, video needs, and listing-ready delivery remain under one roof.",
    pages: [
      {
        id: "property-brief", navLabel: "Property brief", icon: "plan", eyebrow: "Listing strategy", title: "Understand the property and the buyer it must attract.",
        body: "Capture the property type, audience, standout features, intended channels, access constraints, styling needs, and launch deadline before production.",
        checklistTitle: "Property foundation", checklist: ["Listing audience defined", "Key features prioritised", "Access arrangements confirmed", "Launch timing recorded"],
        outputTitle: "Brief outputs", outputs: ["Property brief", "Feature priority list", "Channel requirements", "Production timeline"], actionLabel: "Review property brief", actionTarget: "project",
      },
      {
        id: "space-shot-plan", navLabel: "Space shot plan", icon: "checklist", eyebrow: "On-location coverage", title: "Plan every room, detail, exterior, and movement sequence.",
        body: "Coordinate room order, hero viewpoints, architectural details, lifestyle moments, exterior light, video movement, drone requirements, and contingencies.",
        checklistTitle: "Coverage plan", checklist: ["Rooms and features mapped", "Hero viewpoints agreed", "Exterior conditions checked", "Video sequence planned"],
        outputTitle: "Production controls", outputs: ["Room shot list", "Exterior plan", "Video sequence", "Weather contingency"], actionLabel: "Share property references", actionTarget: "files",
      },
      {
        id: "listing-delivery", navLabel: "Listing media delivery", icon: "delivery", eyebrow: "Market-ready assets", title: "Deliver a complete media set ready for every listing channel.",
        body: "Review image and video selections, request precise finishing changes, approve the final set, and access channel-ready files with clear usage notes.",
        checklistTitle: "Listing readiness", checklist: ["Image selection reviewed", "Video edit approved", "Channel formats checked", "Final media released"],
        outputTitle: "Property media set", outputs: ["Listing photographs", "Property film", "Social cutdowns", "High-resolution archive"], actionLabel: "Open property files", actionTarget: "files",
      },
    ],
  },
  "automotive media": {
    label: "Automotive production garage",
    shortLabel: "Automotive media",
    promise: "Vehicle story, location, motion planning, static coverage, edit direction, and finished automotive assets run as one production.",
    pages: [
      {
        id: "creative-route", navLabel: "Creative route", icon: "plan", eyebrow: "Vehicle story", title: "Set the character, purpose, and visual language of the shoot.",
        body: "Connect the vehicle, audience, campaign use, story, location character, light, references, and practical limitations into one creative route.",
        checklistTitle: "Creative foundation", checklist: ["Vehicle story defined", "Campaign use confirmed", "Location character agreed", "Reference direction approved"],
        outputTitle: "Direction outputs", outputs: ["Creative brief", "Visual treatment", "Location shortlist", "Campaign format plan"], actionLabel: "Review creative route", actionTarget: "project",
      },
      {
        id: "vehicle-coverage", navLabel: "Vehicle coverage", icon: "calendar", eyebrow: "Static and motion", title: "Coordinate every angle, detail, movement, and road sequence.",
        body: "Plan hero angles, design details, rolling shots, interior coverage, driver requirements, route safety, timing, weather, and production permissions.",
        checklistTitle: "Production readiness", checklist: ["Hero angles prioritised", "Motion route approved", "Safety and permissions confirmed", "Weather plan prepared"],
        outputTitle: "Shoot controls", outputs: ["Vehicle shot list", "Motion route", "Safety notes", "Production call sheet"], actionLabel: "Open production plan", actionTarget: "project",
      },
      {
        id: "automotive-gallery", navLabel: "Automotive gallery", icon: "assets", eyebrow: "Finished campaign", title: "Turn the production into a complete automotive media library.",
        body: "Review selects and edits, consolidate finishing notes, approve final motion and stills, and access organised assets for campaign, press, and social use.",
        checklistTitle: "Finishing flow", checklist: ["Still selects approved", "Motion edit reviewed", "Finishing notes resolved", "Campaign exports delivered"],
        outputTitle: "Final media", outputs: ["Hero stills", "Vehicle detail set", "Campaign film", "Social cutdowns"], actionLabel: "Open automotive files", actionTarget: "files",
      },
    ],
  },
  "wedding and personal photography": {
    label: "Private story studio",
    shortLabel: "Your story",
    promise: "The people, timings, meaningful moments, privacy choices, image selection, and final gallery are cared for as one personal story.",
    pages: [
      {
        id: "story-plan", navLabel: "Story plan", icon: "plan", eyebrow: "Personal brief", title: "Begin with the people and moments that matter most.",
        body: "Share the relationships, atmosphere, priorities, meaningful details, sensitivities, image preferences, and private moments that shape the coverage.",
        checklistTitle: "Story foundation", checklist: ["Key people introduced", "Meaningful moments shared", "Visual preferences discussed", "Privacy wishes recorded"],
        outputTitle: "Planning notes", outputs: ["Personal brief", "People notes", "Moment priorities", "Privacy preferences"], actionLabel: "Complete your story brief", actionTarget: "project",
      },
      {
        id: "day-schedule", navLabel: "Day schedule", icon: "calendar", eyebrow: "Calm coordination", title: "Keep the day natural while every important moment is covered.",
        body: "Bring locations, timings, group photographs, travel, light, contacts, contingencies, and moments requiring discretion into one calm working plan.",
        checklistTitle: "Day readiness", checklist: ["Timeline confirmed", "Locations and travel checked", "Group combinations listed", "Contingency plan agreed"],
        outputTitle: "Day controls", outputs: ["Photography timeline", "Group list", "Location notes", "Key contact sheet"], actionLabel: "Review the day plan", actionTarget: "project",
      },
      {
        id: "private-gallery", navLabel: "Private gallery", icon: "assets", eyebrow: "Personal delivery", title: "Relive the story through a carefully finished private gallery.",
        body: "Review highlights, access the complete edited collection, manage private sharing, choose favourites, and keep download and print-ready files together.",
        checklistTitle: "Gallery handover", checklist: ["Highlights prepared", "Full story edited", "Privacy settings confirmed", "Downloads released"],
        outputTitle: "Gallery collection", outputs: ["Highlight selection", "Complete gallery", "Download set", "Print-ready favourites"], actionLabel: "Open private files", actionTarget: "files",
      },
    ],
  },
  "sport and action media": {
    label: "Action coverage centre",
    shortLabel: "Action media",
    promise: "Event intelligence, athlete priorities, access, action coverage, rapid selects, and highlight delivery move at the pace of the sport.",
    pages: [
      {
        id: "event-coverage", navLabel: "Event coverage", icon: "calendar", eyebrow: "Competition plan", title: "Know the event, the athletes, and where the action will happen.",
        body: "Coordinate schedules, disciplines, athletes, teams, access zones, accreditation, safety rules, sponsor needs, and delivery windows before arrival.",
        checklistTitle: "Event readiness", checklist: ["Schedule and disciplines mapped", "Priority athletes confirmed", "Access and safety approved", "Delivery windows agreed"],
        outputTitle: "Coverage controls", outputs: ["Event brief", "Access map", "Athlete priorities", "Delivery schedule"], actionLabel: "Review event plan", actionTarget: "project",
      },
      {
        id: "action-shot-plan", navLabel: "Action shot plan", icon: "checklist", eyebrow: "Peak moments", title: "Anticipate the decisive moments and the atmosphere around them.",
        body: "Plan action positions, technical sequences, reactions, supporters, venue detail, sponsor visibility, portrait opportunities, and vertical coverage.",
        checklistTitle: "Shot priorities", checklist: ["Action positions selected", "Peak sequences identified", "Atmosphere coverage planned", "Sponsor frames marked"],
        outputTitle: "Creative plan", outputs: ["Action shot list", "Position plan", "Story sequence", "Format requirements"], actionLabel: "Share action references", actionTarget: "files",
      },
      {
        id: "highlight-delivery", navLabel: "Highlight delivery", icon: "delivery", eyebrow: "Rapid media", title: "Get the strongest action into the right hands quickly.",
        body: "Review rapid selects, approve the complete edit, and access organised stills and motion assets for press, teams, athletes, sponsors, and social channels.",
        checklistTitle: "Delivery pace", checklist: ["Rapid selects issued", "Hero moments approved", "Channel formats prepared", "Full archive delivered"],
        outputTitle: "Action library", outputs: ["Rapid highlights", "Athlete galleries", "Social cutdowns", "Full-resolution archive"], actionLabel: "Open action files", actionTarget: "files",
      },
    ],
  },
  "google profile foundation": {
    label: "Google presence launchpad",
    shortLabel: "Google Profile",
    promise: "Ownership, business truth, service structure, trust assets, review readiness, and local launch form a dependable Google presence.",
    pages: [
      {
        id: "business-profile", navLabel: "Business profile", icon: "settings", eyebrow: "Profile truth", title: "Build the profile from accurate, customer-ready business information.",
        body: "Confirm ownership, name, address, service areas, contact routes, opening hours, categories, services, attributes, and verification requirements.",
        checklistTitle: "Profile setup", checklist: ["Ownership confirmed", "Business details verified", "Categories and services structured", "Verification route prepared"],
        outputTitle: "Profile foundation", outputs: ["Verified details", "Category structure", "Service catalogue", "Contact routes"], actionLabel: "Review business details", actionTarget: "project",
      },
      {
        id: "trust-builder", navLabel: "Trust builder", icon: "assets", eyebrow: "Customer confidence", title: "Give local customers the proof they need to choose you.",
        body: "Organise business imagery, service evidence, descriptions, questions, review requests, response guidance, and trust-building profile content.",
        checklistTitle: "Trust foundation", checklist: ["Business description approved", "Priority imagery supplied", "Common questions answered", "Review request route agreed"],
        outputTitle: "Trust assets", outputs: ["Profile description", "Image collection", "Question answers", "Review guidance"], actionLabel: "Share profile assets", actionTarget: "files",
      },
      {
        id: "local-launch", navLabel: "Local launch", icon: "insights", eyebrow: "Visibility readiness", title: "Launch a complete profile and establish the next local actions.",
        body: "Check the public profile, resolve warnings or duplication, confirm tracking, publish the foundation, and record the visibility priorities that follow.",
        checklistTitle: "Launch checks", checklist: ["Public profile reviewed", "Duplicates and warnings resolved", "Tracking routes confirmed", "Next visibility actions set"],
        outputTitle: "Launch record", outputs: ["Published profile", "Quality check", "Tracking links", "90-day visibility plan"], actionLabel: "View local results", actionTarget: "results",
      },
    ],
  },
  "aquaoasis website build": {
    label: "AquaOasis website workshop",
    shortLabel: "Website build",
    promise: "Offer clarity, local enquiry strategy, page content, responsive design, build quality, launch, and handover stay in one focused workshop.",
    pages: [
      {
        id: "enquiry-strategy", navLabel: "Enquiry strategy", icon: "plan", eyebrow: "Commercial foundation", title: "Design the website around the customer’s next confident step.",
        body: "Clarify offers, locations, customer questions, proof, objections, conversion routes, search intent, and the enquiries the website must create.",
        checklistTitle: "Strategy foundation", checklist: ["Offers prioritised", "Customer questions captured", "Proof and objections mapped", "Enquiry route agreed"],
        outputTitle: "Strategy outputs", outputs: ["Website brief", "Customer journey", "Page map", "Enquiry plan"], actionLabel: "Open website brief", actionTarget: "project",
      },
      {
        id: "page-studio", navLabel: "Page studio", icon: "review", eyebrow: "Content and design", title: "Shape every page as a useful, persuasive customer experience.",
        body: "Review structure, copy, imagery, local signals, calls to action, mobile behaviour, and visual direction together instead of as disconnected parts.",
        checklistTitle: "Page review", checklist: ["Priority content supplied", "Page structure reviewed", "Design direction approved", "Mobile journey checked"],
        outputTitle: "Page outputs", outputs: ["Conversion copy", "Page designs", "Responsive layouts", "Connected forms"], actionLabel: "Share page feedback", actionTarget: "support",
      },
      {
        id: "launch-desk", navLabel: "Launch desk", icon: "delivery", eyebrow: "Go-live control", title: "Take the finished website live with confidence and clarity.",
        body: "Coordinate domain access, forms, search foundations, analytics, legal content, responsive quality, final approval, launch, and practical handover.",
        checklistTitle: "Launch readiness", checklist: ["Forms and journeys tested", "Domain and tracking ready", "Responsive QA complete", "Launch approval recorded"],
        outputTitle: "Launch package", outputs: ["Live website", "Search foundation", "Analytics setup", "Handover guide"], actionLabel: "Review launch status", actionTarget: "project",
      },
    ],
  },
  "creator presence setup": {
    label: "Creator presence studio",
    shortLabel: "Creator presence",
    promise: "Positioning, profiles, bios, links, proof, contact routes, and publishing readiness become one recognisable creator presence.",
    pages: [
      {
        id: "presence-map", navLabel: "Presence map", icon: "plan", eyebrow: "Creator positioning", title: "Decide what you are known for and where people should find you.",
        body: "Connect audience, themes, offers, credibility, personality, priority channels, search identity, and the action each profile should encourage.",
        checklistTitle: "Presence foundation", checklist: ["Audience and themes defined", "Creator promise clarified", "Priority channels chosen", "Primary action agreed"],
        outputTitle: "Positioning outputs", outputs: ["Creator positioning", "Channel map", "Profile hierarchy", "Contact journey"], actionLabel: "Open presence brief", actionTarget: "project",
      },
      {
        id: "profile-studio", navLabel: "Profile studio", icon: "review", eyebrow: "Profile system", title: "Make every profile feel like the same intentional person.",
        body: "Review names, bios, imagery, featured links, proof, calls to action, platform details, and visual consistency across each chosen channel.",
        checklistTitle: "Profile build", checklist: ["Names and handles aligned", "Bios approved", "Profile imagery supplied", "Featured links arranged"],
        outputTitle: "Profile assets", outputs: ["Bio set", "Profile imagery", "Link structure", "Platform setup"], actionLabel: "Share profile assets", actionTarget: "files",
      },
      {
        id: "contact-journey", navLabel: "Contact journey", icon: "activity", eyebrow: "Audience action", title: "Turn attention into a clear, professional next step.",
        body: "Connect profile visits to the right links, enquiries, bookings, partnerships, email capture, or offers, then check every route end to end.",
        checklistTitle: "Journey checks", checklist: ["Priority links live", "Contact routes tested", "Offers clearly signposted", "Tracking foundation added"],
        outputTitle: "Live presence", outputs: ["Link destination", "Contact routes", "Offer pathways", "Tracking baseline"], actionLabel: "Review connected presence", actionTarget: "results",
      },
    ],
  },
  "digital growth support": {
    label: "Digital growth room",
    shortLabel: "Growth support",
    promise: "Growth priorities, campaigns, content, search, social activity, performance evidence, and next decisions operate in one monthly rhythm.",
    pages: [
      {
        id: "growth-priorities", navLabel: "Growth priorities", icon: "plan", eyebrow: "Growth direction", title: "Focus effort on the few growth moves that matter now.",
        body: "Bring commercial goals, audiences, channels, current performance, constraints, opportunities, measures, and monthly priorities into one practical view.",
        checklistTitle: "Priority setting", checklist: ["Commercial goal confirmed", "Audience opportunity chosen", "Channel role agreed", "Measures and target set"],
        outputTitle: "Growth controls", outputs: ["Growth plan", "Priority audience", "Channel roles", "Monthly targets"], actionLabel: "Review growth plan", actionTarget: "project",
      },
      {
        id: "campaign-room", navLabel: "Campaign room", icon: "calendar", eyebrow: "Coordinated activity", title: "Keep search, content, social, and campaigns working together.",
        body: "Track active briefs, creative production, publishing dates, landing routes, approvals, dependencies, and channel execution without fragmented updates.",
        checklistTitle: "Campaign rhythm", checklist: ["Campaign brief agreed", "Creative work prepared", "Publishing route checked", "Activity launched"],
        outputTitle: "Campaign outputs", outputs: ["Campaign brief", "Content assets", "Channel activity", "Landing journey"], actionLabel: "Share campaign feedback", actionTarget: "support",
      },
      {
        id: "performance-review", navLabel: "Performance review", icon: "insights", eyebrow: "Evidence and learning", title: "Use the evidence to improve the next month, not just report it.",
        body: "Review visibility, attention, enquiries, conversion signals, campaign outcomes, qualitative learning, and the next set of growth decisions together.",
        checklistTitle: "Review discipline", checklist: ["Performance data gathered", "Commercial signals interpreted", "Learning documented", "Next priorities agreed"],
        outputTitle: "Review outputs", outputs: ["Monthly scorecard", "Campaign learning", "Opportunity list", "Next-month plan"], actionLabel: "View growth results", actionTarget: "results",
      },
    ],
  },
  "customer portal": {
    label: "Portal experience lab",
    shortLabel: "Customer portal",
    promise: "Customer journeys, permissions, service data, interface decisions, testing, launch, and adoption form one complete portal product.",
    pages: [
      {
        id: "experience-map", navLabel: "Experience map", icon: "plan", eyebrow: "Customer journey", title: "Design the portal around what customers genuinely need to do.",
        body: "Map customer types, lifecycle stages, tasks, information, files, payments, support routes, permissions, and the moments that should feel effortless.",
        checklistTitle: "Experience foundation", checklist: ["Customer types defined", "Lifecycle tasks mapped", "Data and permissions agreed", "Success measures recorded"],
        outputTitle: "Experience outputs", outputs: ["Customer journey map", "Portal architecture", "Permission model", "Success criteria"], actionLabel: "Open portal brief", actionTarget: "project",
      },
      {
        id: "portal-review", navLabel: "Portal review", icon: "review", eyebrow: "Working experience", title: "Test the portal through the customer’s eyes, end to end.",
        body: "Review real journeys, interface states, content, notifications, mobile behaviour, access rules, integrations, and edge cases in the working portal.",
        checklistTitle: "Experience review", checklist: ["Core journeys exercised", "Roles and permissions tested", "Mobile experience checked", "Feedback consolidated"],
        outputTitle: "Review record", outputs: ["Working portal", "Journey decisions", "Issue queue", "Acceptance notes"], actionLabel: "Report portal feedback", actionTarget: "support",
      },
      {
        id: "portal-launch", navLabel: "Portal launch", icon: "delivery", eyebrow: "Customer rollout", title: "Launch a dependable portal people understand and use.",
        body: "Coordinate production access, data readiness, invitations, help content, team ownership, quality checks, launch communication, and ongoing support.",
        checklistTitle: "Rollout readiness", checklist: ["Production access ready", "Customer data checked", "Invitations and help prepared", "Support ownership agreed"],
        outputTitle: "Launch package", outputs: ["Production portal", "Invitation flow", "Help content", "Support runbook"], actionLabel: "Review launch status", actionTarget: "project",
      },
    ],
  },
  "internal operations system": {
    label: "Operations workspace lab",
    shortLabel: "Operations system",
    promise: "Operational reality, team workflows, records, controls, exceptions, testing, rollout, and adoption become one purposeful internal system.",
    pages: [
      {
        id: "operations-map", navLabel: "Operations map", icon: "plan", eyebrow: "Operational design", title: "Turn scattered administration into a clear operating model.",
        body: "Map people, recurring work, records, handoffs, approvals, tools, exceptions, reporting needs, and control points before the workspace is built.",
        checklistTitle: "Discovery map", checklist: ["Teams and responsibilities mapped", "Core workflows documented", "Records and permissions defined", "Exceptions identified"],
        outputTitle: "Design outputs", outputs: ["Operations map", "Data model", "Role matrix", "Delivery roadmap"], actionLabel: "Open operations brief", actionTarget: "project",
      },
      {
        id: "workspace-testing", navLabel: "Workspace testing", icon: "checklist", eyebrow: "Real-work validation", title: "Test the system with the work your team actually does.",
        body: "Run daily, weekly, exceptional, and permission-sensitive scenarios using realistic records, handoffs, notifications, and reporting expectations.",
        checklistTitle: "Operational testing", checklist: ["Daily workflows passed", "Exceptions exercised", "Permissions validated", "Team feedback resolved"],
        outputTitle: "Test record", outputs: ["Working workspace", "Scenario results", "Issue register", "Acceptance record"], actionLabel: "Report a workflow issue", actionTarget: "support",
      },
      {
        id: "adoption-centre", navLabel: "Adoption centre", icon: "delivery", eyebrow: "Team rollout", title: "Make the new operating system part of everyday work.",
        body: "Coordinate migration, access, team guidance, ownership, launch sequencing, support, improvement requests, and the evidence that adoption is working.",
        checklistTitle: "Adoption readiness", checklist: ["Data migration checked", "Team access prepared", "Guidance delivered", "Support owner assigned"],
        outputTitle: "Rollout package", outputs: ["Live workspace", "Team playbook", "Migration record", "Improvement queue"], actionLabel: "Open team files", actionTarget: "files",
      },
    ],
  },
  "bespoke ecommerce platform": {
    label: "Commerce operations studio",
    shortLabel: "Ecommerce",
    promise: "Customer buying journeys, catalogue, pricing, payments, fulfilment, service operations, testing, and release work as one commerce platform.",
    pages: [
      {
        id: "commerce-blueprint", navLabel: "Commerce blueprint", icon: "plan", eyebrow: "Business and buying model", title: "Design commerce around the complete order, not only the storefront.",
        body: "Connect customers, products, variants, pricing, tax, payments, inventory, fulfilment, returns, service, reporting, and operational ownership.",
        checklistTitle: "Commerce foundation", checklist: ["Customer journeys mapped", "Catalogue rules defined", "Payment and tax needs agreed", "Fulfilment model confirmed"],
        outputTitle: "Blueprint outputs", outputs: ["Commerce journey", "Catalogue model", "Operational map", "Release roadmap"], actionLabel: "Open commerce brief", actionTarget: "project",
      },
      {
        id: "storefront-review", navLabel: "Storefront review", icon: "review", eyebrow: "Buying experience", title: "Review discovery, decision, checkout, and aftercare as one journey.",
        body: "Exercise search, product information, variants, baskets, checkout, account states, messages, mobile behaviour, and operational handoffs in context.",
        checklistTitle: "Journey review", checklist: ["Discovery routes tested", "Product decisions understood", "Checkout scenarios passed", "Operational handoffs checked"],
        outputTitle: "Review outputs", outputs: ["Working storefront", "Journey decisions", "Test orders", "Issue queue"], actionLabel: "Report storefront feedback", actionTarget: "support",
      },
      {
        id: "launch-operations", navLabel: "Launch operations", icon: "delivery", eyebrow: "Commerce release", title: "Launch with the customer experience and back office equally ready.",
        body: "Coordinate catalogue data, payment accounts, tax, inventory, delivery, notifications, analytics, customer support, rollback, and release ownership.",
        checklistTitle: "Commerce readiness", checklist: ["Catalogue and inventory checked", "Payments and tax verified", "Fulfilment rehearsed", "Support and rollback ready"],
        outputTitle: "Release package", outputs: ["Production platform", "Launch checklist", "Operations runbook", "Support plan"], actionLabel: "Review release status", actionTarget: "project",
      },
    ],
  },
  "business automation": {
    label: "Business automation control room",
    shortLabel: "Automation",
    promise: "Business rules, human decisions, connected data, automated paths, exceptions, assurance, monitoring, and ownership stay under control.",
    pages: [
      {
        id: "process-blueprint", navLabel: "Process blueprint", icon: "plan", eyebrow: "Automation design", title: "Automate the repetition while preserving the decisions that matter.",
        body: "Map triggers, data, business rules, people, systems, handoffs, approvals, exceptions, privacy, and measurable value before building the workflow.",
        checklistTitle: "Blueprint foundation", checklist: ["Current process mapped", "Human decisions protected", "Data and systems confirmed", "Exceptions documented"],
        outputTitle: "Blueprint outputs", outputs: ["Process map", "Automation logic", "Integration plan", "Exception register"], actionLabel: "Open process brief", actionTarget: "project",
      },
      {
        id: "scenario-testing", navLabel: "Scenario testing", icon: "checklist", eyebrow: "Workflow assurance", title: "Prove the normal, unusual, and failure paths before release.",
        body: "Exercise realistic records, permissions, approvals, duplicate events, missing data, third-party failures, notifications, retries, and recovery behaviour.",
        checklistTitle: "Assurance suite", checklist: ["Normal paths passed", "Business exceptions tested", "Failure recovery verified", "Owner acceptance recorded"],
        outputTitle: "Test evidence", outputs: ["Scenario matrix", "Data checks", "Issue record", "Acceptance decision"], actionLabel: "Report a scenario result", actionTarget: "support",
      },
      {
        id: "live-monitoring", navLabel: "Live monitoring", icon: "activity", eyebrow: "Controlled operation", title: "Know what the automation is doing and when people must step in.",
        body: "See workflow health, successful runs, exceptions, alerts, recovery ownership, change requests, value delivered, and continuous improvement priorities.",
        checklistTitle: "Operational control", checklist: ["Monitoring connected", "Alerts routed", "Recovery ownership assigned", "Change process agreed"],
        outputTitle: "Control outputs", outputs: ["Monitoring view", "Live runbook", "Exception queue", "Change log"], actionLabel: "Request an automation change", actionTarget: "support",
      },
    ],
  },
  "operational dashboard": {
    label: "Operational intelligence room",
    shortLabel: "Dashboard",
    promise: "Trusted signals, clear thresholds, connected data, operational exceptions, decisions, and next actions become one live management view.",
    pages: [
      {
        id: "signal-design", navLabel: "Signal design", icon: "plan", eyebrow: "Operational intelligence", title: "Choose the signals that should change what the team does next.",
        body: "Define decisions, users, measures, sources, calculations, thresholds, freshness, ownership, and the action expected when each signal changes.",
        checklistTitle: "Signal foundation", checklist: ["Operational decisions identified", "Measures and definitions agreed", "Data sources confirmed", "Threshold actions assigned"],
        outputTitle: "Signal outputs", outputs: ["Decision map", "Metric dictionary", "Source register", "Alert rules"], actionLabel: "Open dashboard brief", actionTarget: "project",
      },
      {
        id: "dashboard-review", navLabel: "Dashboard review", icon: "review", eyebrow: "Working intelligence", title: "Review the dashboard using real questions and real operating data.",
        body: "Test comprehension, filters, comparisons, drill-downs, data freshness, permissions, edge states, and whether each view leads to a useful decision.",
        checklistTitle: "Decision testing", checklist: ["Core questions answered", "Metric definitions validated", "Filters and drill-downs tested", "User feedback resolved"],
        outputTitle: "Review record", outputs: ["Working dashboard", "Data validation", "Decision notes", "Issue queue"], actionLabel: "Report dashboard feedback", actionTarget: "support",
      },
      {
        id: "exception-desk", navLabel: "Exception desk", icon: "activity", eyebrow: "Operational response", title: "Move from noticing an exception to owning the next action.",
        body: "Monitor threshold breaches, unusual movement, stale data, assigned responses, resolution status, recurring patterns, and improvement opportunities.",
        checklistTitle: "Response readiness", checklist: ["Alerts configured", "Owners assigned", "Response routes tested", "Resolution record prepared"],
        outputTitle: "Live controls", outputs: ["Operational dashboard", "Exception queue", "Alert routing", "Response history"], actionLabel: "View operational results", actionTarget: "results",
      },
    ],
  },
};
