// T1 R036 smoke — Profile picture upload (circular avatar).
// Run via `npm run smoke:profile-picture-upload` (tsx --test).
//
// § Profile picture upload — covers data-URL validation (round-trip,
// cap, mime guard, base64 sanity), ProfileMenu fallback to initials,
// CSS variant, route handler shape, layout wire-up.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateAvatarDataUrl, AVATAR_MAX_DATA_URL_BYTES } from "../src/lib/avatarDataUrl";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const TYPES = join(ROOT, "src", "server", "types.ts");
const USERS = join(ROOT, "src", "server", "users.ts");
const ROUTE = join(ROOT, "src", "app", "api", "auth", "profile", "avatar", "route.ts");
const PROFILE_MENU = join(ROOT, "src", "components", "chrome", "ProfileMenu.tsx");
const TOPBAR = join(ROOT, "src", "components", "chrome", "Topbar.tsx");
const ACCOUNT = join(ROOT, "src", "app", "portal", "account", "page.tsx");
const UPLOADER = join(ROOT, "src", "app", "portal", "account", "AvatarUploader.tsx");
const STYLES = join(ROOT, "public", "_marketing", "styles.css");
const AGENCY_LAYOUT = join(ROOT, "src", "app", "portal", "agency", "layout.tsx");
const CLIENT_LAYOUT = join(ROOT, "src", "app", "portal", "clients", "[clientId]", "layout.tsx");
const CUSTOMER_LAYOUT = join(ROOT, "src", "app", "portal", "customer", "layout.tsx");

// 1×1 transparent PNG, base64 — known-good fixture for round-trip.
const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=";

describe("§ Profile picture upload — validator round-trip", () => {
  it("accepts a well-formed PNG data URL", () => {
    const r = validateAvatarDataUrl(TINY_PNG);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.mime, "image/png");
      assert.equal(r.dataUrl, TINY_PNG);
    }
  });

  it("accepts JPEG and WebP mimes", () => {
    const jpg = "data:image/jpeg;base64,AAAAAAAA";
    const webp = "data:image/webp;base64,AAAAAAAA";
    assert.equal(validateAvatarDataUrl(jpg).ok, true);
    assert.equal(validateAvatarDataUrl(webp).ok, true);
  });
});

describe("§ Profile picture upload — cap enforcement", () => {
  it("rejects payloads above AVATAR_MAX_DATA_URL_BYTES with `too_large`", () => {
    const huge = "data:image/png;base64," + "A".repeat(AVATAR_MAX_DATA_URL_BYTES);
    const r = validateAvatarDataUrl(huge);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error, "too_large");
  });

  it("cap is the ~50KB target the round documented", () => {
    assert.equal(AVATAR_MAX_DATA_URL_BYTES, 50_000);
  });
});

describe("§ Profile picture upload — mime guard", () => {
  it("rejects SVG (XSS vector — script tags inside <svg>)", () => {
    const svg = "data:image/svg+xml;base64,PHN2Zy8+";
    const r = validateAvatarDataUrl(svg);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error, "bad_mime");
  });

  it("rejects GIF (animation noise + outside allow-list)", () => {
    const gif = "data:image/gif;base64,AAAAAAAA";
    const r = validateAvatarDataUrl(gif);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error, "bad_mime");
  });

  it("rejects non-data-URL strings + missing values", () => {
    assert.equal(validateAvatarDataUrl("https://example.com/a.png").ok, false);
    assert.equal(validateAvatarDataUrl("").ok, false);
    assert.equal(validateAvatarDataUrl(undefined).ok, false);
    assert.equal(validateAvatarDataUrl(123).ok, false);
  });

  it("rejects bad base64 payload (not multiple of 4)", () => {
    const r = validateAvatarDataUrl("data:image/png;base64,ABC");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error, "bad_base64");
  });
});

describe("§ Profile picture upload — schema + store", () => {
  it("ServerUser carries optional avatarUrl field (R036)", () => {
    const src = readFileSync(TYPES, "utf8");
    assert.ok(src.includes("avatarUrl?: string"));
    assert.ok(src.includes("R036"));
  });

  it("UpdateUserPatch supports `string | null` for clear-on-null semantics", () => {
    const src = readFileSync(USERS, "utf8");
    assert.ok(src.includes("avatarUrl?: string | null"));
    // null → undefined (cleared); undefined → leave alone; string → save.
    assert.ok(src.includes("patch.avatarUrl === null"));
    assert.ok(src.includes("nextAvatar"));
  });
});

describe("§ Profile picture upload — route handler", () => {
  it("/api/auth/profile/avatar exposes POST + DELETE behind requireSession", () => {
    assert.equal(existsSync(ROUTE), true);
    const src = readFileSync(ROUTE, "utf8");
    assert.ok(src.includes("export async function POST"));
    assert.ok(src.includes("export async function DELETE"));
    assert.ok(src.includes("requireSession"));
    assert.ok(src.includes("validateAvatarDataUrl"));
  });

  it("returns 413 on too_large + 400 on other validation errors", () => {
    const src = readFileSync(ROUTE, "utf8");
    assert.ok(src.includes('v.error === "too_large" ? 413 : 400'));
  });

  it("DELETE clears avatar via updateUser({ avatarUrl: null })", () => {
    const src = readFileSync(ROUTE, "utf8");
    assert.ok(src.includes("avatarUrl: null"));
  });
});

describe("§ Profile picture upload — ProfileMenu fallback to initials", () => {
  it("ProfileMenu renders <img> when avatarUrl is set", () => {
    const src = readFileSync(PROFILE_MENU, "utf8");
    assert.ok(src.includes("avatarUrl?: string"));
    assert.ok(src.includes("mm-profile-avatar-img"));
    assert.ok(src.includes("avatarUrl ?"));
  });

  it("ProfileMenu falls back to initials chip when avatarUrl is missing", () => {
    const src = readFileSync(PROFILE_MENU, "utf8");
    // Both branches present — initials() invocation lives in the else branch.
    assert.ok(src.includes("initials(display)"));
    assert.ok(src.includes('className="mm-profile-avatar"'));
  });

  it("CSS ships the .mm-profile-avatar-img variant (object-fit: cover, circle)", () => {
    const src = readFileSync(STYLES, "utf8");
    assert.ok(src.includes(".mm-profile-avatar-img"));
    assert.ok(src.includes("object-fit: cover"));
    assert.ok(src.includes("border-radius: 999px"));
  });
});

describe("§ Profile picture upload — topbar + layout wire-up", () => {
  it("Topbar accepts avatarUrl prop + threads to ProfileMenu", () => {
    const src = readFileSync(TOPBAR, "utf8");
    assert.ok(src.includes("avatarUrl?: string"));
    assert.ok(src.includes("avatarUrl={avatarUrl}"));
  });

  it("agency / client / customer layouts thread getUserById(...).avatarUrl", () => {
    for (const path of [AGENCY_LAYOUT, CLIENT_LAYOUT, CUSTOMER_LAYOUT]) {
      const src = readFileSync(path, "utf8");
      assert.ok(
        src.includes("avatarUrl={getUserById(session.userId)?.avatarUrl}"),
        `expected avatarUrl thread-through in ${path}`,
      );
    }
  });
});

describe("§ Profile picture upload — account page upload zone", () => {
  it("AvatarUploader is a client component that POSTs JSON to the avatar route", () => {
    assert.equal(existsSync(UPLOADER), true);
    const src = readFileSync(UPLOADER, "utf8");
    assert.ok(src.startsWith('"use client"'));
    assert.ok(src.includes("/api/auth/profile/avatar"));
    assert.ok(src.includes("application/json") || src.includes('"content-type"'));
    assert.ok(src.includes("canvas")); // client-side resize via <canvas>
    assert.ok(src.includes("256")); // TARGET_PX cap
  });

  it("DELETE path wired for clear→fallback to initials", () => {
    const src = readFileSync(UPLOADER, "utf8");
    assert.ok(src.includes('method: "DELETE"'));
  });

  it("account page mounts AvatarUploader with current avatar + initials", () => {
    const src = readFileSync(ACCOUNT, "utf8");
    assert.ok(src.includes("AvatarUploader"));
    assert.ok(src.includes("initialAvatarUrl={user.avatarUrl}"));
    assert.ok(src.includes("displayInitials="));
  });
});
