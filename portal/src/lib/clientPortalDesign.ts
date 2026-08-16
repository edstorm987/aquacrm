import type {
  ClientPortalCustomCode,
  ClientPortalDesignDocument,
  ClientPortalMode,
  ClientPortalSectionId,
} from "@/server/types";
import { defaultPortalBuilder, normalisePortalBuilder } from "@/lib/clientPortalBuilder";

export const CLIENT_PORTAL_TEMPLATE_ID = "stunning-standard";
export const CLIENT_PORTAL_TEMPLATE_NAME = "Stunning Standard";

export const CLIENT_PORTAL_MODES: ClientPortalMode[] = [
  "onboarding",
  "designing",
  "developed-launch",
  "maintenance",
];

export const CLIENT_PORTAL_SECTIONS: ClientPortalSectionId[] = [
  "home",
  "project",
  "results",
  "files",
  "billing",
  "support",
  "resources",
  "details",
];

export const EMPTY_CLIENT_PORTAL_CUSTOM_CODE: ClientPortalCustomCode = {
  enabled: false,
  placement: "after-content",
  title: "Custom portal extension",
  scopedCss: "",
  html: "",
  css: "",
  javascript: "",
  minHeight: 240,
};

export const STUNNING_STANDARD_PORTAL: ClientPortalDesignDocument = {
  schemaVersion: 1,
  theme: {
    accentColor: "#8b6c33",
    backgroundColor: "#f2f0eb",
    surfaceColor: "#fbfaf8",
    darkColor: "#131210",
    heroColor: "#1b1a18",
  },
  chrome: {
    serviceLabel: "Private client service",
    preparedForLabel: "Prepared for",
    currentStageLabel: "Current stage",
    privateHomeLabel: "Private client home",
  },
  stages: {
    onboarding: {
      label: "Onboarding",
      eyebrow: "A thoughtful beginning",
      heading: "We are laying the foundations.",
      body: "Your brief, priorities, ideas, costs, and agreements are being brought together before the creative work begins.",
      progress: 18,
      focus: "Share the details and inspiration that will help us understand your world.",
    },
    designing: {
      label: "In progress",
      eyebrow: "Work in progress",
      heading: "The work is taking shape.",
      body: "{providerName} is turning the agreed direction into something real. Your feedback keeps every decision purposeful.",
      progress: 48,
      focus: "Review the direction, leave focused feedback, and approve what comes next.",
    },
    "developed-launch": {
      label: "Review & delivery",
      eyebrow: "Coming together",
      heading: "Your delivery is nearly ready.",
      body: "The final details are coming together. Review the latest work, share any last notes, and confirm delivery.",
      progress: 82,
      focus: "Review the latest work and confirm the final delivery details.",
    },
    maintenance: {
      label: "Live care",
      eyebrow: "Always looked after",
      heading: "Your digital home is live.",
      body: "{providerName} is keeping an eye on the important things while you use support and ongoing improvements as needed.",
      progress: 100,
      focus: "Use support for changes, questions, or anything that does not feel quite right.",
    },
  },
  pages: {
    home: {
      label: "Home",
      visible: true,
      eyebrow: "Welcome, {firstName}",
      title: "{serviceHeadline}",
      body: "Your project, conversations, files, billing, and support live here throughout our work together.",
    },
    project: {
      label: "Project",
      visible: true,
      eyebrow: "Your {projectLabel}",
      title: "{stageHeading}",
      body: "{stageBody}",
    },
    results: {
      label: "Results",
      visible: true,
      eyebrow: "Your results",
      title: "See what the work is producing.",
      body: "A clear view of visibility, visits, enquiries, search performance, and the outcomes your work is reaching.",
    },
    files: {
      label: "Files",
      visible: true,
      eyebrow: "Files & inspiration",
      title: "One home for every detail.",
      body: "Briefs, recordings, working files, invoices, previews, and the links you share with us stay connected to the work.",
    },
    billing: {
      label: "Billing",
      visible: true,
      eyebrow: "Plan & billing",
      title: "Clear, calm, accounted for.",
      body: "Your service plan, invoices, payment status, and billing links live here. No hunting through emails.",
    },
    support: {
      label: "Support",
      visible: true,
      eyebrow: "Client care",
      title: "Tell us. We will take it from here.",
      body: "Use this space for support, feedback, new ideas, or anything you want kept with your work.",
    },
    resources: {
      label: "Resources",
      visible: true,
      eyebrow: "Resources",
      title: "A place reserved for you.",
      body: "Guides, handover notes, and useful material selected for your work will live here.",
    },
    details: {
      label: "Your record",
      visible: true,
      eyebrow: "Your complete record",
      title: "Everything we know, shared with you.",
      body: "Your approved notes, conversations, call recordings, decisions, documents, and account history remain transparent and available throughout our work together.",
    },
  },
  home: {
    welcomeBody: "Your project, conversations, files, billing, and support live here throughout our work together.",
    nextMoveEyebrow: "Your next move",
    recentUpdatesEyebrow: "Recent updates",
    projectLogTitle: "Your project log",
    careEyebrow: "{providerName} care",
    careTitle: "We are within reach.",
    careBody: "Questions, feedback, changes, or something urgent: send it through your support space and it stays attached to your project.",
    careButtonLabel: "Open support",
  },
  builder: defaultPortalBuilder(CLIENT_PORTAL_SECTIONS),
  customCode: { ...EMPTY_CLIENT_PORTAL_CUSTOM_CODE },
};

export function clonePortalDesign(document: ClientPortalDesignDocument = STUNNING_STANDARD_PORTAL): ClientPortalDesignDocument {
  return structuredClone(document);
}

export function normalisePortalDesign(value: unknown, fallback: ClientPortalDesignDocument = STUNNING_STANDARD_PORTAL): ClientPortalDesignDocument {
  const input = objectValue(value);
  const theme = objectValue(input.theme);
  const chrome = objectValue(input.chrome);
  const stages = objectValue(input.stages);
  const pages = objectValue(input.pages);
  const home = objectValue(input.home);
  const builder = objectValue(input.builder);
  const customCode = objectValue(input.customCode);
  const result = clonePortalDesign(fallback);

  result.theme = {
    accentColor: cleanColor(theme.accentColor, fallback.theme.accentColor),
    backgroundColor: cleanColor(theme.backgroundColor, fallback.theme.backgroundColor),
    surfaceColor: cleanColor(theme.surfaceColor, fallback.theme.surfaceColor),
    darkColor: cleanColor(theme.darkColor, fallback.theme.darkColor),
    heroColor: cleanColor(theme.heroColor, fallback.theme.heroColor),
  };
  result.chrome = {
    serviceLabel: cleanText(chrome.serviceLabel, fallback.chrome.serviceLabel, 80),
    preparedForLabel: cleanText(chrome.preparedForLabel, fallback.chrome.preparedForLabel, 80),
    currentStageLabel: cleanText(chrome.currentStageLabel, fallback.chrome.currentStageLabel, 80),
    privateHomeLabel: cleanText(chrome.privateHomeLabel, fallback.chrome.privateHomeLabel, 80),
  };

  for (const mode of CLIENT_PORTAL_MODES) {
    const source = objectValue(stages[mode]);
    const base = fallback.stages[mode];
    result.stages[mode] = {
      label: cleanText(source.label, base.label, 80),
      eyebrow: cleanText(source.eyebrow, base.eyebrow, 120),
      heading: cleanText(source.heading, base.heading, 180),
      body: cleanText(source.body, base.body, 700),
      progress: cleanProgress(source.progress, base.progress),
      focus: cleanText(source.focus, base.focus, 500),
    };
  }

  for (const section of CLIENT_PORTAL_SECTIONS) {
    const source = objectValue(pages[section]);
    const base = fallback.pages[section];
    result.pages[section] = {
      label: cleanText(source.label, base.label, 60),
      visible: typeof source.visible === "boolean" ? source.visible : base.visible,
      eyebrow: cleanText(source.eyebrow, base.eyebrow, 120),
      title: cleanText(source.title, base.title, 180),
      body: cleanText(source.body, base.body, 700),
    };
  }

  result.home = {
    welcomeBody: cleanText(home.welcomeBody, fallback.home.welcomeBody, 700),
    nextMoveEyebrow: cleanText(home.nextMoveEyebrow, fallback.home.nextMoveEyebrow, 100),
    recentUpdatesEyebrow: cleanText(home.recentUpdatesEyebrow, fallback.home.recentUpdatesEyebrow, 100),
    projectLogTitle: cleanText(home.projectLogTitle, fallback.home.projectLogTitle, 140),
    careEyebrow: cleanText(home.careEyebrow, fallback.home.careEyebrow, 100),
    careTitle: cleanText(home.careTitle, fallback.home.careTitle, 180),
    careBody: cleanText(home.careBody, fallback.home.careBody, 700),
    careButtonLabel: cleanText(home.careButtonLabel, fallback.home.careButtonLabel, 80),
  };
  result.builder = normalisePortalBuilder(builder, CLIENT_PORTAL_SECTIONS, fallback.builder);
  result.customCode = {
    enabled: typeof customCode.enabled === "boolean" ? customCode.enabled : fallback.customCode?.enabled ?? false,
    placement: customCode.placement === "before-content" || customCode.placement === "after-content"
      ? customCode.placement
      : fallback.customCode?.placement ?? EMPTY_CLIENT_PORTAL_CUSTOM_CODE.placement,
    title: cleanText(customCode.title, fallback.customCode?.title || EMPTY_CLIENT_PORTAL_CUSTOM_CODE.title, 100),
    scopedCss: cleanCode(customCode.scopedCss, fallback.customCode?.scopedCss, 30_000),
    html: cleanCode(customCode.html, fallback.customCode?.html, 40_000),
    css: cleanCode(customCode.css, fallback.customCode?.css, 30_000),
    javascript: cleanCode(customCode.javascript, fallback.customCode?.javascript, 40_000),
    minHeight: cleanExtensionHeight(customCode.minHeight, fallback.customCode?.minHeight),
  };
  return result;
}

export function portalCustomCode(document: ClientPortalDesignDocument): ClientPortalCustomCode {
  return {
    ...EMPTY_CLIENT_PORTAL_CUSTOM_CODE,
    ...document.customCode,
  };
}

export function formatPortalCopy(value: string, tokens: Record<string, string>): string {
  return value.replace(/\{([a-zA-Z]+)\}/g, (match, key: string) => tokens[key] ?? match);
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cleanText(value: unknown, fallback: string, max: number): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}

function cleanCode(value: unknown, fallback: string | undefined, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : fallback ?? "";
}

function cleanExtensionHeight(value: unknown, fallback: number | undefined): number {
  const height = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(1_200, Math.max(120, Math.round(height ?? EMPTY_CLIENT_PORTAL_CUSTOM_CODE.minHeight)));
}

function cleanColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim().toLowerCase() : fallback;
}

function cleanProgress(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : fallback;
}
