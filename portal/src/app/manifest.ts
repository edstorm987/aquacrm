import type { MetadataRoute } from "next";

/**
 * The web app manifest.
 *
 * Without this, "add to home screen" produces a bookmark: it opens in the
 * browser with its chrome, and it does not feel like the customer's app. With
 * it, the portal launches standalone from the home screen or the dock, which
 * is the whole point of telling somebody to install it.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Aqua — your client portal",
    short_name: "Aqua",
    description: "Your project, files, billing and support in one place.",
    start_url: "/portal/customer",
    scope: "/",
    display: "standalone",
    background_color: "#0e1013",
    theme_color: "#0e1013",
    orientation: "portrait-primary",
    icons: [
      { src: "/favicon-default-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/favicon-default-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/favicon-default-180.png", sizes: "180x180", type: "image/png" },
      { src: "/favicon-default-32.png", sizes: "32x32", type: "image/png" },
    ],
  };
}
