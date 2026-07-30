export const TRADING_BRANDS = [
  {
    slug: "zimante-group",
    name: "Zimante Group",
    description: "The parent group coordinating media, web, software and combined transformation work.",
    website: "https://zimante.group",
    primaryColor: "#17211F",
    secondaryColor: "#F4F0E7",
    accentColor: "#D7A85D",
  },
  {
    slug: "milesymedia",
    name: "Milesymedia",
    description: "Photography and video for businesses, events, people, property, automotive and personal milestones.",
    website: "https://milesymedia.com",
    primaryColor: "#241F1B",
    secondaryColor: "#F7F4EE",
    accentColor: "#C58A5A",
  },
  {
    slug: "aquaoasis-web",
    name: "AquaOasis-Web",
    description: "Websites, Google Business Profile and local visibility made clear for small businesses and creators.",
    website: "https://aquaoasis-web.com",
    primaryColor: "#123A5A",
    secondaryColor: "#FBF8F2",
    accentColor: "#8A623D",
  },
  {
    slug: "software-studio",
    name: "Software Studio",
    description: "Bespoke portals, ecommerce, automation and operational software built around real business workflows.",
    primaryColor: "#17211F",
    secondaryColor: "#F3F5F2",
    accentColor: "#5E9E92",
  },
] as const;

export type TradingBrandSlug = (typeof TRADING_BRANDS)[number]["slug"];

export function isTradingBrandSlug(value: unknown): value is TradingBrandSlug {
  return typeof value === "string" && TRADING_BRANDS.some((brand) => brand.slug === value);
}

export function tradingBrandDefinition(slug: TradingBrandSlug) {
  return TRADING_BRANDS.find((brand) => brand.slug === slug)!;
}
