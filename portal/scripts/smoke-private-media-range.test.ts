import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { after, before, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

// The range helper is a server module; the tests below drive its real provider
// adapters, so `server-only` is neutralised exactly as the other server-module
// smokes do.
const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

type Media = typeof import("../src/lib/server/privateMediaResponse");
type Storage = typeof import("../src/lib/server/privateUploadStorage");
let media: Media;
let storage: Storage;

const DIR = join(process.cwd(), ".data", "private-media-range-smoke");
const FILE = join(DIR, "clip.bin");
// 4 KiB is larger than a single stream chunk boundary is interesting for, and
// small enough to assert byte-for-byte.
const BYTES = Buffer.from(Array.from({ length: 4096 }, (_, index) => index % 251));

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  media = await import("../src/lib/server/privateMediaResponse");
  storage = await import("../src/lib/server/privateUploadStorage");
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, BYTES);
});

after(() => {
  rmSync(DIR, { recursive: true, force: true });
});

async function bodyOf(response: Response): Promise<Buffer> {
  return Buffer.from(await response.arrayBuffer());
}

function localResponse(rangeHeader: string | null, size: number | null = BYTES.length) {
  return media.privateMediaResponse({
    rangeHeader,
    size,
    headers: new Headers({ "content-type": "audio/webm" }),
    read: range => media.readLocalFileRange(FILE, range),
  });
}

test("a single byte range is parsed exactly, and anything unhonourable is ignored not guessed", () => {
  const size = 1000;
  assert.deepEqual(media.parseByteRange(null, size), { kind: "full" });
  assert.deepEqual(media.parseByteRange("", size), { kind: "full" });
  assert.deepEqual(media.parseByteRange("bytes=0-99", size), { kind: "partial", range: { start: 0, end: 99 } });
  assert.deepEqual(media.parseByteRange("bytes=400-599", size), { kind: "partial", range: { start: 400, end: 599 } });
  // Open-ended and suffix forms, as a seeking media element sends them.
  assert.deepEqual(media.parseByteRange("bytes=900-", size), { kind: "partial", range: { start: 900, end: 999 } });
  assert.deepEqual(media.parseByteRange("bytes=-128", size), { kind: "partial", range: { start: 872, end: 999 } });
  // A suffix longer than the object is the whole object, not an error.
  assert.deepEqual(media.parseByteRange("bytes=-5000", size), { kind: "partial", range: { start: 0, end: 999 } });
  // An end past the object is clamped rather than over-claimed.
  assert.deepEqual(media.parseByteRange("bytes=990-9999", size), { kind: "partial", range: { start: 990, end: 999 } });
  // Out of bounds is the one case that must become 416.
  assert.deepEqual(media.parseByteRange("bytes=1000-1050", size), { kind: "unsatisfiable" });
  assert.deepEqual(media.parseByteRange("bytes=1000-", size), { kind: "unsatisfiable" });
  assert.deepEqual(media.parseByteRange("bytes=-0", size), { kind: "unsatisfiable" });
  assert.deepEqual(media.parseByteRange("bytes=0-0", 0), { kind: "unsatisfiable" });
  // Ignored: malformed, unsupported unit, multi-range, unknown size.
  assert.deepEqual(media.parseByteRange("bytes=99-10", size), { kind: "full" });
  assert.deepEqual(media.parseByteRange("items=0-10", size), { kind: "full" });
  assert.deepEqual(media.parseByteRange("bytes=abc-def", size), { kind: "full" });
  assert.deepEqual(media.parseByteRange("bytes=-", size), { kind: "full" });
  assert.deepEqual(media.parseByteRange("bytes=0-10,20-30", size), { kind: "full" });
  assert.deepEqual(media.parseByteRange("bytes=0-10", null), { kind: "full" });
});

test("a ranged request gets exact 206 bytes and headers, never the whole object", async () => {
  const response = await localResponse("bytes=100-199");
  assert.ok(response);
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-range"), `bytes 100-199/${BYTES.length}`);
  assert.equal(response.headers.get("content-length"), "100");
  assert.equal(response.headers.get("accept-ranges"), "bytes");
  assert.equal(response.headers.get("content-type"), "audio/webm");
  const body = await bodyOf(response);
  assert.equal(body.length, 100);
  assert.ok(body.equals(BYTES.subarray(100, 200)));
});

test("open-ended and suffix seeks return their real tail bytes", async () => {
  const open = await localResponse("bytes=4000-");
  assert.ok(open);
  assert.equal(open.status, 206);
  assert.equal(open.headers.get("content-range"), `bytes 4000-4095/${BYTES.length}`);
  assert.ok((await bodyOf(open)).equals(BYTES.subarray(4000)));

  const suffix = await localResponse("bytes=-64");
  assert.ok(suffix);
  assert.equal(suffix.status, 206);
  assert.equal(suffix.headers.get("content-range"), `bytes 4032-4095/${BYTES.length}`);
  assert.ok((await bodyOf(suffix)).equals(BYTES.subarray(4032)));
});

test("an unsatisfiable seek is a 416 that states the real size and reads nothing", async () => {
  let reads = 0;
  const response = await media.privateMediaResponse({
    rangeHeader: "bytes=99999-",
    size: BYTES.length,
    headers: new Headers({ "content-type": "audio/webm" }),
    read: range => { reads += 1; return media.readLocalFileRange(FILE, range); },
  });
  assert.ok(response);
  assert.equal(response.status, 416);
  assert.equal(response.headers.get("content-range"), `bytes */${BYTES.length}`);
  assert.equal(response.headers.get("content-length"), "0");
  assert.equal((await bodyOf(response)).length, 0);
  assert.equal(reads, 0, "an unsatisfiable range must not touch storage");
});

test("a normal full request still returns 200, and advertises ranges only when the size is known", async () => {
  const full = await localResponse(null);
  assert.ok(full);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get("accept-ranges"), "bytes");
  assert.equal(full.headers.get("content-length"), String(BYTES.length));
  assert.equal(full.headers.get("content-range"), null);
  assert.ok((await bodyOf(full)).equals(BYTES));

  // An object whose size this surface does not know cannot promise ranges.
  const unknown = await localResponse("bytes=0-9", null);
  assert.ok(unknown);
  assert.equal(unknown.status, 200);
  assert.equal(unknown.headers.get("accept-ranges"), "none");
  assert.equal(unknown.headers.get("content-length"), null);
  assert.ok((await bodyOf(unknown)).equals(BYTES));
});

test("a missing stored object stays a 404 for the route, not an empty 206", async () => {
  const response = await media.privateMediaResponse({
    rangeHeader: "bytes=0-9",
    size: BYTES.length,
    headers: new Headers(),
    read: range => media.readLocalFileRange(join(DIR, "gone.bin"), range),
  });
  assert.equal(response, null);
  assert.equal(await media.readLocalFileRange(join(DIR, "gone.bin"), null), null);
});

test("a provider that ignores Range is sliced, never trusted to have honoured it", async () => {
  const asked: string[] = [];
  const fullStream = () => new ReadableStream<Uint8Array>({
    start(controller) {
      // Deliberately chunked so the slice has to span chunk boundaries.
      for (let offset = 0; offset < BYTES.length; offset += 300) {
        controller.enqueue(new Uint8Array(BYTES.subarray(offset, Math.min(offset + 300, BYTES.length))));
      }
      controller.close();
    },
  });

  // A store that honours the range: its partial stream is passed through as-is.
  const honouring = await media.readVercelBlobRange("https://blob/x", { start: 10, end: 29 }, async (_url, options) => {
    asked.push(String(new Headers(options.headers).get("range")));
    return {
      statusCode: 206,
      headers: new Headers({ "content-range": `bytes 10-29/${BYTES.length}` }),
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(BYTES.subarray(10, 30)));
          controller.close();
        },
      }),
    };
  });
  assert.deepEqual(asked, ["bytes=10-29"]);
  assert.ok(honouring);
  assert.ok(Buffer.from(await new Response(honouring).arrayBuffer()).equals(BYTES.subarray(10, 30)));

  // A store that ignores it and streams everything: we still emit exactly the range.
  const ignoring = await media.readVercelBlobRange("https://blob/x", { start: 1000, end: 1999 }, async () => ({
    statusCode: 200,
    headers: new Headers(),
    stream: fullStream(),
  }));
  assert.ok(ignoring);
  const sliced = Buffer.from(await new Response(ignoring).arrayBuffer());
  assert.equal(sliced.length, 1000);
  assert.ok(sliced.equals(BYTES.subarray(1000, 2000)));

  // A store that could not serve the object at all reports nothing found.
  assert.equal(await media.readVercelBlobRange("https://blob/x", null, async () => ({ statusCode: 404, stream: null })), null);

  // The shape `@vercel/blob` ACTUALLY returns for an honoured range: its `get()`
  // only special-cases 304 and 404, so a real `206` arrives as `statusCode: 200`
  // carrying the partial stream and the upstream `Content-Range`. Slicing that
  // stream a second time would skip past every byte it holds and emit nothing
  // under a `206` that promised the full window, so `Content-Range` — not the
  // SDK's status — is what decides whether the body is already the range.
  const sdkPartial = await media.readVercelBlobRange("https://blob/x", { start: 1000, end: 1999 }, async () => ({
    statusCode: 200,
    headers: new Headers({ "content-range": `bytes 1000-1999/${BYTES.length}`, "content-length": "1000" }),
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(BYTES.subarray(1000, 1500)));
        controller.enqueue(new Uint8Array(BYTES.subarray(1500, 2000)));
        controller.close();
      },
    }),
  }));
  assert.ok(sdkPartial);
  const passedThrough = Buffer.from(await new Response(sdkPartial).arrayBuffer());
  assert.equal(passedThrough.length, 1000, "an already-partial stream must be passed through, not sliced again");
  assert.ok(passedThrough.equals(BYTES.subarray(1000, 2000)));

  // A store that answers a window we did not ask for cannot be dressed up as
  // the one the route already promised in Content-Range/Content-Length.
  assert.equal(
    await media.readVercelBlobRange("https://blob/x", { start: 1000, end: 1999 }, async () => ({
      statusCode: 200,
      headers: new Headers({ "content-range": `bytes 0-499/${BYTES.length}` }),
      stream: fullStream(),
    })),
    null,
    "a mismatched Content-Range must not be presented as the requested range",
  );

  // Content-Length has already promised the whole window by the time the body
  // streams, so a store that runs out early must fail the transfer instead of
  // closing short and letting a truncated recording read as a complete one.
  const short = media.sliceStream(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(BYTES.subarray(0, 100)));
        controller.close();
      },
    }),
    { start: 0, end: 999 },
  );
  await assert.rejects(new Response(short).arrayBuffer(), /ended after 100 of 1000 bytes/);
});

test("the Supabase adapter makes a real ranged read instead of downloading the object", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  process.env.NEXT_PUBLIC_SUPABASE_UPLOAD_BUCKET = "aquacrm-uploads";
  const calls: Array<{ url: string; range: string | null; auth: string | null }> = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(input), range: headers.get("range"), auth: headers.get("authorization") });
    return new Response(BYTES.subarray(64, 128), {
      status: 206,
      headers: { "content-range": `bytes 64-127/${BYTES.length}` },
    });
  }) as unknown as typeof fetch;

  const body = await storage.readSupabasePrivateUploadRange("inbox-calls/agency-1/clip.webm", { start: 64, end: 127 }, fetchImpl);
  assert.ok(body);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://example.supabase.co/storage/v1/object/aquacrm-uploads/inbox-calls/agency-1/clip.webm");
  assert.equal(calls[0].range, "bytes=64-127");
  assert.equal(calls[0].auth, "Bearer service-role-key");
  assert.ok(Buffer.from(await new Response(body).arrayBuffer()).equals(BYTES.subarray(64, 128)));

  // A bucket that ignores the range still yields exactly the requested slice.
  const ignoring = (async () => new Response(BYTES, { status: 200 })) as unknown as typeof fetch;
  const fallback = await storage.readSupabasePrivateUploadRange("inbox-media/agency-1/note.webm", { start: 2048, end: 2147 }, ignoring);
  assert.ok(fallback);
  assert.ok(Buffer.from(await new Response(fallback).arrayBuffer()).equals(BYTES.subarray(2048, 2148)));

  // A refusing bucket is reported as missing, never as a truncated body.
  const refusing = (async () => new Response("no", { status: 403 })) as unknown as typeof fetch;
  assert.equal(await storage.readSupabasePrivateUploadRange("inbox-media/agency-1/note.webm", { start: 0, end: 9 }, refusing), null);

  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_UPLOAD_BUCKET;
});

test("every private media route answers through the one shared range contract", () => {
  for (const route of [
    "src/app/api/portal/inbox/media/content/route.ts",
    "src/app/api/portal/website-enquiries/calls/recording/content/route.ts",
    "src/app/api/portal/sops/content/route.ts",
  ]) {
    const source = read(route);
    assert.match(source, /privateMediaResponse\(/);
    assert.match(source, /request\.headers\.get\("range"\)/);
    // No route may hand back a hard-coded whole-object 200 of its own again.
    assert.doesNotMatch(source, /new Response\(/);
  }
  const inboxMedia = read("src/lib/server/inbox/inboxMedia.ts");
  assert.match(inboxMedia, /readLocalFileRange/);
  assert.match(inboxMedia, /readVercelBlobRange/);
  assert.match(inboxMedia, /readSupabasePrivateUploadRange/);
  // The Vercel path must not buffer the whole object into a Blob any more.
  assert.doesNotMatch(inboxMedia, /\.blob\(\)/);
});
