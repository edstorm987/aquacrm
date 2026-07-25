// Smoke — R038 responsive image attrs helper.

import {
  buildImageAttrs, withCdnResize, auditImage,
} from "../lib/responsiveImage";
import type { Block } from "../types/block";

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

(async () => {
  console.log("§ Responsive images");

  // ─── A: hero intent ───────────────────────────────────────────────────
  {
    const a = buildImageAttrs("/img/banner.jpg", "hero");
    expect("hero srcset has 5 widths",
      a.srcset.split(",").length === 5);
    expect("hero srcset includes 2400w",
      a.srcset.includes(" 2400w"));
    expect("hero sizes 100vw", a.sizes === "100vw");
    expect("hero loading eager", a.loading === "eager");
    expect("hero fetchpriority high", a.fetchpriority === "high");
    expect("hero decoding async", a.decoding === "async");
    expect("hero src is largest variant",
      a.src.includes("w=2400"));
  }

  // ─── B: card intent ───────────────────────────────────────────────────
  {
    const a = buildImageAttrs("/img/card.jpg", "card");
    expect("card srcset has 3 widths",
      a.srcset.split(",").length === 3);
    expect("card sizes responsive",
      a.sizes === "(max-width: 640px) 100vw, 33vw");
    expect("card loading lazy", a.loading === "lazy");
    expect("card has no fetchpriority", a.fetchpriority === undefined);
  }

  // ─── C: thumb intent ──────────────────────────────────────────────────
  {
    const a = buildImageAttrs("/img/t.jpg", "thumb");
    expect("thumb srcset has 2 widths",
      a.srcset.split(",").length === 2);
    expect("thumb sizes 120px", a.sizes === "120px");
    expect("thumb loading lazy", a.loading === "lazy");
  }

  // ─── D: full-width intent ────────────────────────────────────────────
  {
    const a = buildImageAttrs("/img/fw.jpg", "full-width");
    expect("full-width srcset has 4 widths",
      a.srcset.split(",").length === 4);
    expect("full-width sizes 100vw", a.sizes === "100vw");
    expect("full-width loading lazy", a.loading === "lazy");
  }

  // ─── E: opts overrides ───────────────────────────────────────────────
  {
    const a = buildImageAttrs("/img/x.jpg", "card", { loading: "eager", fetchpriority: "high" });
    expect("opts.loading overrides preset", a.loading === "eager");
    expect("opts.fetchpriority overrides preset", a.fetchpriority === "high");
  }

  // ─── F: CDN param injection ──────────────────────────────────────────
  {
    expect("appends ?w to bare URL",
      withCdnResize("/x.jpg", 320) === "/x.jpg?w=320");
    expect("appends w to existing query",
      withCdnResize("/x.jpg?fmt=webp", 320) === "/x.jpg?fmt=webp&w=320");
    expect("idempotent — replaces existing w",
      withCdnResize(withCdnResize("/x.jpg", 320), 640) === "/x.jpg?w=640");
    expect("preserves anchor",
      withCdnResize("/x.jpg#crop", 320) === "/x.jpg?w=320#crop");
    expect("custom resizeParam",
      withCdnResize("/x.jpg", 320, { resizeParam: "width" }) === "/x.jpg?width=320");
    expect("absolute URL accepted",
      withCdnResize("https://cdn.example/x.jpg", 320) === "https://cdn.example/x.jpg?w=320");
  }

  // ─── G: srcset uses CDN param ────────────────────────────────────────
  {
    const a = buildImageAttrs("https://cdn.example/x.jpg?fmt=webp", "card", { resizeParam: "width" });
    expect("srcset uses configured resizeParam",
      a.srcset.includes("width=320 320w") &&
      a.srcset.includes("width=480 480w") &&
      a.srcset.includes("width=640 640w"));
    expect("srcset preserves existing query",
      a.srcset.includes("fmt=webp"));
  }

  // ─── H: auditImage ───────────────────────────────────────────────────
  {
    const noAlt: Block = { id: "1", type: "image", props: { src: "/x.jpg", width: 100, height: 100 } };
    const codes = auditImage(noAlt).map(i => i.code);
    expect("missing-alt detected",
      codes.includes("missing-alt") && codes.length === 1);

    const altOnA11y: Block = { id: "2", type: "image",
      props: { src: "/x.jpg", width: 100, height: 100 },
      a11y: { alt: "ok" } };
    expect("a11y.alt satisfies alt requirement",
      auditImage(altOnA11y).length === 0);

    const noDims: Block = { id: "3", type: "image", props: { src: "/x.jpg", alt: "ok" } };
    const codes2 = auditImage(noDims).map(i => i.code).sort();
    expect("missing-width + missing-height both flagged",
      codes2.length === 2 &&
      codes2[0] === "missing-height" &&
      codes2[1] === "missing-width");

    const noSrc: Block = { id: "4", type: "image", props: { alt: "x", width: 1, height: 1 } };
    expect("missing-src flagged when no src",
      auditImage(noSrc).map(i => i.code).includes("missing-src"));

    const absDisallowed: Block = { id: "5", type: "image",
      props: { src: "https://evil.com/x.jpg", alt: "ok", width: 1, height: 1 } };
    expect("absolute URL flagged when not allowlisted",
      auditImage(absDisallowed).map(i => i.code).includes("absolute-url-not-allowed"));
    expect("absolute URL passes when allowlisted",
      auditImage(absDisallowed, { domainAllowlist: ["evil.com"] }).length === 0);
    expect("absolute URL flagged when allowlist mismatch",
      auditImage(absDisallowed, { domainAllowlist: ["other.com"] })
        .map(i => i.code).includes("absolute-url-not-allowed"));
  }

  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
