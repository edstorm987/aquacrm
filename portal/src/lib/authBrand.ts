export type AuthBrandId = "milesymedia" | "aqua" | "aquacrm" | "zimante";

export interface AuthBrand {
  id: AuthBrandId;
  name: string;
  mark: string;
  eyebrow: string;
  headline: string;
  tagline: string;
  points: string[];
  homeUrl: string;
}

export function getAuthBrand(value: string | undefined): AuthBrand {
  if (value === "aquacrm") {
    return {
      id: "aquacrm",
      name: "AquaCRM",
      mark: "A",
      eyebrow: "Business operating system",
      headline: "One system for the whole customer journey.",
      tagline:
        "Keep sales, clients, work, money, support and performance connected in one calm workspace.",
      points: [
        "Keep every customer and decision in context.",
        "Run actions, delivery, billing and support together.",
        "See what needs attention without switching tools.",
      ],
      homeUrl:
        process.env.NEXT_PUBLIC_AQUACRM_WEBSITE_URL ??
        "/",
    };
  }

  if (value === "aqua") {
    return {
      id: "aqua",
      name: "AquaOasis-Web",
      mark: "A",
      eyebrow: "Client workspace",
      headline: "One clear place for everything we are building.",
      tagline:
        "Follow progress, review decisions and keep your website, software, billing and support connected.",
      points: [
        "See progress and what needs your attention.",
        "Review files, feedback and approvals.",
        "Keep billing and support in one history.",
      ],
      homeUrl:
        process.env.NEXT_PUBLIC_AQUAOASIS_URL ?? "http://localhost:3034",
    };
  }

  if (value === "zimante") {
    return {
      id: "zimante",
      name: "Zimante Group",
      mark: "Z",
      eyebrow: "Private group workspace",
      headline: "Every company. One joined-up project home.",
      tagline:
        "Follow combined work without chasing separate conversations, files or decisions.",
      points: [
        "Shared progress across the group.",
        "Clear decisions and responsibilities.",
        "One connected support history.",
      ],
      homeUrl:
        process.env.NEXT_PUBLIC_ZIMANTE_URL ?? "http://localhost:3033",
    };
  }

  return {
    id: "milesymedia",
    name: "Milesymedia",
    mark: "M",
    eyebrow: "Client portal",
    headline: "Everything we are building together.",
    tagline:
      "Your secure Milesymedia home for the project, decisions, files, billing and support.",
    points: [
      "See progress and what needs your attention.",
      "Review files, ideas, feedback and approvals.",
      "Keep project history, billing and support together.",
    ],
    homeUrl:
      process.env.NEXT_PUBLIC_MILESYMEDIA_WEBSITE_URL ??
      "http://localhost:3030",
  };
}
