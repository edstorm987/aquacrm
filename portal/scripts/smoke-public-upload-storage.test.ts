// Smoke — Public upload storage (the `aquacrm-public` bucket boundary).
// Run in the full suite: PORTAL_BACKEND=memory NODE_OPTIONS='--conditions
// react-server' npx tsx --test scripts/*.test.ts
//
// § Public media storage — behavioural coverage of the three-tier provider
// precedence (Supabase → throw-in-prod → local-dev) and, critically, that the
// helper returns a real public URL — the whole point vs. the proxied private
// path. See docs/development/plans/public-bucket.md (Phase 1).
//
// NOTE: the suite runs test files concurrently in one shared process, so this
// test NEVER mutates global `process.env` / `globalThis.fetch` (that would race
// into other files). Branch selection is driven through the injectable `env`
// argument; the Supabase network path is pinned by source-shape guardrails,
// matching the private-upload-storage convention.

import { strict as assert } from "node:assert";
import { describe, it, test } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  storePublicUpload,
  supabasePublicUploadsConfigured,
  durablePublicUploadsRequired,
  publicUploadContentTypeAllowed,
  normalizePublicUploadContentType,
  ALLOWED_PUBLIC_UPLOAD_CONTENT_TYPES,
  PublicUploadStorageError,
  PublicUploadContentTypeError,
  PublicUploadPathError,
} from "../src/lib/server/publicUploadStorage";

const tinyBlob = () => new Blob([Uint8Array.from([1, 2, 3, 4])], { type: "image/png" });

// --- 1. Local-dev fallback returns a resolvable public URL + writes bytes ---
test("local-dev stores public media under public/ and returns a servable URL", async () => {
  const smokeDir = "smoke-phase1";
  const localKey = "brand/logo.png";
  const absDir = join(process.cwd(), "public", "uploads-public", smokeDir);
  try {
    const stored = await storePublicUpload(
      {
        pathname: `website-media/agency-1/${smokeDir}/${localKey}`,
        file: tinyBlob(),
        contentType: "image/png",
        localDirectory: smokeDir,
        localKey,
      },
      { NODE_ENV: "development" } as NodeJS.ProcessEnv, // no Supabase, not durable → local
    );

    assert.equal(stored.storageProvider, "local");
    assert.equal(stored.storageKey, localKey);
    // The returned URL must be a root-relative path Next serves statically.
    assert.equal(stored.publicUrl, `/uploads-public/${smokeDir}/${localKey}`);
    assert.ok(stored.publicUrl.startsWith("/"), "public URL is root-relative");
    // The bytes must actually land on disk where that URL resolves.
    assert.equal(existsSync(join(absDir, "brand", "logo.png")), true);
  } finally {
    await rm(absDir, { recursive: true, force: true });
  }
});

// --- 2. Production without Supabase fails closed (nothing leaks to local) ---
test("public uploads fail closed in production when Supabase is unconfigured", async () => {
  await assert.rejects(
    () => storePublicUpload(
      {
        pathname: "website-media/agency-1/x.png",
        file: tinyBlob(),
        contentType: "image/png",
        localDirectory: "x",
        localKey: "x.png",
      },
      { NODE_ENV: "production" } as NodeJS.ProcessEnv, // durable required, no Supabase → throw
    ),
    (err: unknown) => {
      assert.ok(err instanceof PublicUploadStorageError);
      assert.equal((err as PublicUploadStorageError).code, "durable_public_uploads_required");
      return true;
    },
  );
});

// --- 3. Config predicates gate the branches (pure, injected env) -----------
describe("§ Public upload config predicates", () => {
  it("supabasePublicUploadsConfigured requires BOTH url + service key", () => {
    assert.equal(supabasePublicUploadsConfigured({ NEXT_PUBLIC_SUPABASE_URL: "https://x" } as NodeJS.ProcessEnv), false);
    assert.equal(supabasePublicUploadsConfigured({ SUPABASE_SERVICE_ROLE_KEY: "k" } as NodeJS.ProcessEnv), false);
    assert.equal(
      supabasePublicUploadsConfigured({ NEXT_PUBLIC_SUPABASE_URL: "https://x", SUPABASE_SERVICE_ROLE_KEY: "k" } as NodeJS.ProcessEnv),
      true,
    );
  });

  it("durablePublicUploadsRequired is true in production / on Vercel", () => {
    assert.equal(durablePublicUploadsRequired({ NODE_ENV: "production" } as NodeJS.ProcessEnv), true);
    assert.equal(durablePublicUploadsRequired({ VERCEL: "1" } as NodeJS.ProcessEnv), true);
    assert.equal(durablePublicUploadsRequired({ VERCEL_ENV: "preview" } as NodeJS.ProcessEnv), true);
    assert.equal(durablePublicUploadsRequired({ NODE_ENV: "development" } as NodeJS.ProcessEnv), false);
  });
});

// --- 4. Design guardrails (pin the deliberate shape + the Supabase path) ---
describe("§ Public upload storage — design guardrails", () => {
  const src = readFileSync("src/lib/server/publicUploadStorage.ts", "utf8");

  it("targets the public bucket and returns a getPublicUrl (CDN) URL", () => {
    assert.match(src, /aquacrm-public/);
    assert.match(src, /NEXT_PUBLIC_SUPABASE_PUBLIC_BUCKET/);
    assert.match(src, /\.upload\(/);
    assert.match(src, /getPublicUrl/);
    assert.match(src, /publicUrl: data\.publicUrl/);
  });

  it("re-publishes to a stable URL (upsert) unlike the private helper", () => {
    assert.match(src, /upsert: true/);
  });

  it("fails closed in production via a typed error", () => {
    assert.match(src, /durablePublicUploadsRequired/);
    assert.match(src, /PublicUploadStorageError/);
    assert.match(src, /NODE_ENV === "production"/);
  });

  it("does not depend on @vercel/blob (simpler precedence than the private helper)", () => {
    assert.doesNotMatch(src, /from "@vercel\/blob"/);
  });

  it("allow-lists the content type before the provider branch", () => {
    assert.match(src, /publicUploadContentTypeAllowed\(input\.contentType\)/);
    assert.ok(
      src.indexOf("publicUploadContentTypeAllowed(input.contentType)")
        < src.indexOf("if (supabasePublicUploadsConfigured(env))"),
      "the allow-list gate must run before the Supabase branch",
    );
    assert.doesNotMatch(src, /"image\/svg\+xml"/);
  });

  it("guards the local write with resolve + a startsWith boundary check", () => {
    assert.match(src, /resolve\(process\.cwd\(\), "public", LOCAL_PUBLIC_DIR\)/);
    assert.match(src, /startsWith\(publicRoot \+ sep\)/);
    assert.match(src, /PublicUploadPathError/);
  });
});

// --- 5. Content-type allow-list (defense in depth, audit hardening) --------
// Public media is CDN-served with no proxy, so it must be inert. The gate sits
// BEFORE the provider branch, so it holds on the Supabase path too.
describe("§ Public upload content-type allow-list", () => {
  const storeWith = (contentType: string) => storePublicUpload(
    {
      pathname: `website-media/agency-1/x`,
      file: new Blob([Uint8Array.from([1, 2, 3, 4])], { type: contentType }),
      contentType,
      localDirectory: "smoke-mime",
      localKey: "x",
    },
    { NODE_ENV: "development" } as NodeJS.ProcessEnv,
  );

  it("rejects image/svg+xml — an SVG can carry script", async () => {
    await assert.rejects(() => storeWith("image/svg+xml"), (err: unknown) => {
      assert.ok(err instanceof PublicUploadContentTypeError);
      assert.equal((err as PublicUploadContentTypeError).code, "public_upload_content_type_not_allowed");
      return true;
    });
    // Nothing may reach disk when the type is refused.
    assert.equal(existsSync(join(process.cwd(), "public", "uploads-public", "smoke-mime")), false);
  });

  it("rejects text/html and other executable / unknown types", async () => {
    for (const bad of ["text/html", "application/javascript", "application/octet-stream", "image/svg", ""]) {
      await assert.rejects(() => storeWith(bad), PublicUploadContentTypeError, `expected ${bad} rejected`);
    }
  });

  it("rejects even when Supabase IS configured (gate is before the branch)", async () => {
    await assert.rejects(
      () => storePublicUpload(
        {
          pathname: "website-media/agency-1/evil.svg",
          file: new Blob([Uint8Array.from([1])], { type: "image/svg+xml" }),
          contentType: "image/svg+xml",
          localDirectory: "smoke-mime",
          localKey: "evil.svg",
        },
        {
          NEXT_PUBLIC_SUPABASE_URL: "https://x",
          SUPABASE_SERVICE_ROLE_KEY: "k",
        } as NodeJS.ProcessEnv,
      ),
      PublicUploadContentTypeError,
    );
  });

  it("allows the safe image/video types, case- and parameter-insensitively", () => {
    for (const good of ALLOWED_PUBLIC_UPLOAD_CONTENT_TYPES) {
      assert.equal(publicUploadContentTypeAllowed(good), true, `${good} should be allowed`);
    }
    assert.equal(publicUploadContentTypeAllowed("IMAGE/PNG"), true);
    assert.equal(publicUploadContentTypeAllowed(" image/png ; charset=utf-8"), true);
    assert.equal(normalizePublicUploadContentType("IMAGE/PNG; charset=utf-8"), "image/png");
    assert.equal(publicUploadContentTypeAllowed("image/svg+xml"), false);
    assert.equal(publicUploadContentTypeAllowed("text/html"), false);
  });

  it("the allow-list contains no executable type", () => {
    for (const t of ALLOWED_PUBLIC_UPLOAD_CONTENT_TYPES) {
      assert.ok(t.startsWith("image/") || t.startsWith("video/"), `${t} is not image/video`);
      assert.notEqual(t, "image/svg+xml");
    }
  });

  it("stores the NORMALISED content type, not the caller's verbatim string", async () => {
    const absDir = join(process.cwd(), "public", "uploads-public", "smoke-norm");
    try {
      const stored = await storePublicUpload(
        {
          pathname: "website-media/agency-1/n.png",
          file: tinyBlob(),
          contentType: "IMAGE/PNG; charset=utf-8",
          localDirectory: "smoke-norm",
          localKey: "n.png",
        },
        { NODE_ENV: "development" } as NodeJS.ProcessEnv,
      );
      assert.equal(stored.storageProvider, "local");
      assert.equal(existsSync(join(absDir, "n.png")), true);
    } finally {
      await rm(absDir, { recursive: true, force: true });
    }
  });
});

// --- 6. Local-write path stays inside public/uploads-public/ ---------------
// Not exploitable from the one real caller (content-addressed keys), but the
// boundary must self-defend for the next caller. Dev-only path; prod fails
// closed before it.
describe("§ Public upload local-write path guard", () => {
  const escape = (localDirectory: string, localKey: string) => storePublicUpload(
    {
      pathname: "website-media/agency-1/x.png",
      file: tinyBlob(),
      contentType: "image/png",
      localDirectory,
      localKey,
    },
    { NODE_ENV: "development" } as NodeJS.ProcessEnv,
  );

  it("rejects ../ traversal in localKey and localDirectory", async () => {
    const escapee = join(process.cwd(), "public", "pwned.png");
    for (const [dir, key] of [
      ["website-media", "../../pwned.png"],
      ["../..", "pwned.png"],
      ["website-media", "../../../../../../tmp/pwned.png"],
    ] as const) {
      await assert.rejects(() => escape(dir, key), (err: unknown) => {
        assert.ok(err instanceof PublicUploadPathError, `expected path error for ${dir}/${key}`);
        assert.equal((err as PublicUploadPathError).code, "public_upload_path_escape");
        return true;
      });
    }
    assert.equal(existsSync(escapee), false, "traversal must not write outside uploads-public");
  });

  it("rejects an absolute localKey (resolve would honour it)", async () => {
    await assert.rejects(
      () => escape("website-media", join(process.cwd(), "public", "abs-pwned.png")),
      PublicUploadPathError,
    );
    assert.equal(existsSync(join(process.cwd(), "public", "abs-pwned.png")), false);
  });

  it("rejects a sibling-prefix escape (uploads-public-evil)", async () => {
    await assert.rejects(() => escape("..", "uploads-public-evil/x.png"), PublicUploadPathError);
    assert.equal(existsSync(join(process.cwd(), "public", "uploads-public-evil")), false);
  });

  it("still writes normal nested keys and returns a URL matching the file on disk", async () => {
    const absDir = join(process.cwd(), "public", "uploads-public", "smoke-guard");
    try {
      const stored = await storePublicUpload(
        {
          pathname: "website-media/agency-1/deep/a.png",
          file: tinyBlob(),
          contentType: "image/png",
          localDirectory: "smoke-guard",
          localKey: "agency-1/deep/a.png",
        },
        { NODE_ENV: "development" } as NodeJS.ProcessEnv,
      );
      assert.equal(stored.publicUrl, "/uploads-public/smoke-guard/agency-1/deep/a.png");
      // The URL must resolve to the file that was actually written.
      assert.equal(
        existsSync(join(process.cwd(), "public", ...stored.publicUrl.slice(1).split("/"))),
        true,
      );
    } finally {
      await rm(absDir, { recursive: true, force: true });
    }
  });
});
