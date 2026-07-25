// Materializer — pure function from CollectedClientState (+ optional
// preset) to MaterializedFile[]. Mirrors T5's `clients/luv-and-ker/`
// shape exactly:
//
//   <slug>/
//   ├── package.json                 file:.. workspace deps for installed plugins
//   ├── next.config.ts
//   ├── tsconfig.json
//   ├── postcss.config.mjs
//   ├── tailwind.config.ts
//   ├── portal-config.json           round-trippable state (incl. _generatedFingerprints)
//   └── src/
//       ├── app/
//       │   ├── layout.tsx           injects brand kit
//       │   ├── page.tsx             home — renders the "home" BlockTree
//       │   └── globals.css
//       └── lib/
//           ├── portalConfig.ts      reads portal-config.json
//           └── brandKit.ts          inlined brand kit literal
//
// Idempotent: same input → byte-identical output. Files are pure
// strings; the FilesystemPort writes them.

import { fnv1a } from "../lib/ids";
import type {
  BlockTree,
  CollectedClientState,
  GeneratedFingerprintMap,
  MaterializedFile,
  PortalConfigDoc,
  PortalPreset,
  PortalRole,
} from "../lib/domain";
import type { BrandKit, PluginId } from "../lib/tenancy";

export interface MaterializeArgs {
  state: CollectedClientState;
  preset?: PortalPreset;
  authOrigin?: string;                  // defaults to milesymedia.com
  cookieName?: string;                  // defaults to lk_session_v1
}

export function materialize(args: MaterializeArgs): MaterializedFile[] {
  const { state } = args;
  const slug = state.client.slug;
  const brand = mergeBrand(state.client.brand, args.preset?.defaultBrand);
  const installedPlugins = unique([
    ...state.installedPlugins,
    ...(args.preset?.installedPlugins ?? []),
  ]);
  const variants = mergeVariants(state.portalVariants, args.preset?.portalVariants);
  const blockTrees = mergeBlockTrees(state.blockTrees, args.preset?.starterContent.pages ?? []);

  const out: MaterializedFile[] = [];
  const portalConfig = renderPortalConfig({
    state,
    brand,
    installedPlugins,
    variants,
    authOrigin: args.authOrigin ?? "https://milesymedia.com",
    cookieName: args.cookieName ?? "lk_session_v1",
  });

  // Compute fingerprints for everything else, then bake them into the
  // portal-config so re-export can detect operator hand-edits.
  const ledger: GeneratedFingerprintMap = {};
  const stage = (path: string, content: string): void => {
    const fp = fnv1a(content);
    ledger[path] = fp;
    out.push({ path, content, fingerprint: fp, generated: true });
  };

  stage("package.json", renderPackageJson(slug, installedPlugins));
  stage("next.config.ts", renderNextConfig());
  stage("tsconfig.json", renderTsConfig());
  stage("postcss.config.mjs", renderPostcssConfig());
  stage("tailwind.config.ts", renderTailwindConfig(brand));
  stage("src/app/globals.css", renderGlobalsCss(brand));
  stage("src/app/layout.tsx", renderLayoutTsx(state.client.name, brand));
  stage("src/app/page.tsx", renderHomePageTsx(blockTrees));
  stage("src/lib/brandKit.ts", renderBrandKitTs(brand));
  stage("src/lib/portalConfig.ts", renderPortalConfigTs());

  // Now the portal-config — bake the ledger in BEFORE we fingerprint
  // the file itself so the JSON is fully reproducible.
  const portalConfigContent = JSON.stringify(
    { ...portalConfig, _generatedFingerprints: ledger },
    null,
    2,
  ) + "\n";
  out.push({
    path: "portal-config.json",
    content: portalConfigContent,
    fingerprint: fnv1a(portalConfigContent),
    generated: true,
  });

  return out;
}

// ─── Helpers ────────────────────────────────────────────────────────────

function mergeBrand(client: BrandKit, presetDefault?: BrandKit): BrandKit {
  // Brand always wins — preset only fills gaps.
  if (!presetDefault) return client;
  return {
    ...presetDefault,
    ...client,
    primaryColor: client.primaryColor || presetDefault.primaryColor,
  };
}

function mergeVariants(
  client: Partial<Record<PortalRole, string>>,
  presetDefault: Partial<Record<PortalRole, string>> = {},
): Partial<Record<PortalRole, string>> {
  return { ...presetDefault, ...client };
}

function mergeBlockTrees(client: BlockTree[], presetDefault: BlockTree[]): BlockTree[] {
  // Client trees win per pageId; preset fills missing pages.
  const map = new Map<string, BlockTree>();
  for (const p of presetDefault) map.set(p.pageId, p);
  for (const p of client) map.set(p.pageId, p);
  return [...map.values()];
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

// ─── File renderers ─────────────────────────────────────────────────────

function renderPackageJson(slug: string, plugins: PluginId[]): string {
  const deps: Record<string, string> = {
    "next": "16.2.4",
    "react": "19.2.4",
    "react-dom": "19.2.4",
  };
  // Sort plugins for determinism.
  const sorted = [...plugins].sort();
  for (const id of sorted) {
    deps[`@aqua/plugin-${id}`] = `file:../../plugins/${id}`;
  }
  // Stable dependency-key ordering: aqua/* first sorted, then framework.
  const aqua = Object.fromEntries(
    Object.entries(deps).filter(([k]) => k.startsWith("@aqua/")),
  );
  const framework = Object.fromEntries(
    Object.entries(deps).filter(([k]) => !k.startsWith("@aqua/")),
  );
  const pkg = {
    name: `${slug}-portal`,
    version: "0.1.0",
    private: true,
    description: `${slug} — generated per-client portal. Built by @aqua/plugin-portal-export from collected agency portal state.`,
    scripts: {
      dev: "next dev -p 4040",
      build: "next build",
      start: "next start -p 4040",
      typecheck: "tsc --noEmit",
    },
    dependencies: { ...aqua, ...framework },
    devDependencies: {
      "@tailwindcss/postcss": "^4",
      "@types/node": "^20",
      "@types/react": "^19",
      "@types/react-dom": "^19",
      "tailwindcss": "^4",
      "typescript": "^5",
    },
  };
  return JSON.stringify(pkg, null, 2) + "\n";
}

function renderNextConfig(): string {
  // Same security headers + CSP as T5's luv-and-ker. transpilePackages
  // is omitted in v1 — the materialized package.json already uses
  // file:../../plugins/<id> workspace deps which Next picks up
  // automatically. T1 can wire transpilePackages explicitly when the
  // generated app needs SSR for plugin code.
  return `import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: { root: import.meta.dirname },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
`;
}

function renderTsConfig(): string {
  const cfg = {
    compilerOptions: {
      target: "ES2022",
      lib: ["dom", "dom.iterable", "esnext"],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: "esnext",
      moduleResolution: "bundler",
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: "react-jsx",
      incremental: true,
      plugins: [{ name: "next" }],
      paths: { "@/*": ["./src/*"] },
    },
    include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
    exclude: ["node_modules"],
  };
  return JSON.stringify(cfg, null, 2) + "\n";
}

function renderPostcssConfig(): string {
  return `const config = {
  plugins: { "@tailwindcss/postcss": {} },
};
export default config;
`;
}

function renderTailwindConfig(brand: BrandKit): string {
  return `import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: ${jsString(brand.primaryColor)},
        ${brand.secondaryColor ? `brandSecondary: ${jsString(brand.secondaryColor)},` : ""}
        ${brand.accentColor ? `brandAccent: ${jsString(brand.accentColor)},` : ""}
      },
      fontFamily: {
        ${brand.fontHeading ? `heading: [${jsString(brand.fontHeading)}],` : ""}
        ${brand.fontBody ? `body: [${jsString(brand.fontBody)}],` : ""}
      },
      borderRadius: {
        ${brand.borderRadius ? `brand: ${jsString(brand.borderRadius)},` : ""}
      },
    },
  },
  plugins: [],
};

export default config;
`;
}

function renderGlobalsCss(brand: BrandKit): string {
  const lines = [
    `@import "tailwindcss";`,
    ``,
    `:root {`,
    `  --brand-primary: ${brand.primaryColor};`,
  ];
  if (brand.secondaryColor) lines.push(`  --brand-secondary: ${brand.secondaryColor};`);
  if (brand.accentColor) lines.push(`  --brand-accent: ${brand.accentColor};`);
  if (brand.fontHeading) lines.push(`  --font-heading: ${brand.fontHeading};`);
  if (brand.fontBody) lines.push(`  --font-body: ${brand.fontBody};`);
  if (brand.borderRadius) lines.push(`  --brand-radius: ${brand.borderRadius};`);
  lines.push(`}`, ``);
  if (brand.customCSS) lines.push(brand.customCSS, ``);
  return lines.join("\n");
}

function renderLayoutTsx(name: string, brand: BrandKit): string {
  return `import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: ${jsString(name)},
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: ${jsString(brand.secondaryColor ?? "#fff")}, color: "#111", fontFamily: ${jsString(brand.fontBody ?? "system-ui")} }}>
        {children}
      </body>
    </html>
  );
}
`;
}

function renderHomePageTsx(trees: BlockTree[]): string {
  const home = trees.find(t => t.pageId === "home");
  const treeJson = JSON.stringify(home ?? { pageId: "home", rootBlocks: [] }, null, 2);
  return `// Home page. Renders the "home" BlockTree collected at export time.
// Block renderers come from the workspace plugins — this page just
// passes the JSON through.

import { rootBlocks } from "@/lib/portalConfig";

const TREE = ${treeJson} as const;

export default function HomePage() {
  return (
    <main>
      <h1 style={{ fontFamily: "var(--font-heading, serif)", fontSize: "2rem", margin: "1rem" }}>
        Welcome
      </h1>
      <pre style={{ padding: "1rem", background: "#f5f5f5", overflow: "auto" }}>
        {JSON.stringify(rootBlocks(TREE), null, 2)}
      </pre>
    </main>
  );
}
`;
}

function renderBrandKitTs(brand: BrandKit): string {
  return `// Inlined brand kit — frozen at export time.

export const BRAND_KIT = ${JSON.stringify(brand, null, 2)} as const;

export type BrandKit = typeof BRAND_KIT;
`;
}

function renderPortalConfigTs(): string {
  return `// Reader for the portal-config.json shipped alongside this app.

import config from "../../portal-config.json" with { type: "json" };

export interface BlockNode {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  children?: BlockNode[];
}

export interface BlockTree {
  pageId: string;
  title?: string;
  rootBlocks: BlockNode[];
}

export function rootBlocks(tree: BlockTree): BlockNode[] {
  return tree.rootBlocks;
}

export const PORTAL_CONFIG = config;
`;
}

function renderPortalConfig(args: {
  state: CollectedClientState;
  brand: BrandKit;
  installedPlugins: PluginId[];
  variants: Partial<Record<PortalRole, string>>;
  authOrigin: string;
  cookieName: string;
}): PortalConfigDoc {
  const { state, brand, installedPlugins, variants } = args;
  return {
    $schema: "https://aqua.milesymedia.com/schemas/portal-config.v1.json",
    client: {
      id: state.client.id,
      slug: state.client.slug,
      name: state.client.name,
      tagline: state.client.tagline,
      agencyId: state.client.agencyId,
      websiteUrl: state.client.websiteUrl,
    },
    brand,
    auth: {
      origin: args.authOrigin,
      embedLoginPath: "/embed/login",
      loginPath: "/login",
      cookieName: args.cookieName,
    },
    installedPlugins: [...installedPlugins].sort().map(id => ({ id, version: "0.1.0" })),
    portalVariants: variants,
    content: state.customContent,
  };
}

function jsString(s: string): string {
  return JSON.stringify(s);
}
