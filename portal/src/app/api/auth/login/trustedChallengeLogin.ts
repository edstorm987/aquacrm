import "server-only";

import { NextRequest } from "next/server";

import { POST as loginPost } from "./route";

function exactHostname(value: string): string {
  const hostname = value.trim().toLowerCase();
  if (!hostname || hostname.length > 253) throw new Error("trusted_login_hostname_invalid");
  let parsed: URL;
  try {
    parsed = new URL(`https://${hostname}/`);
  } catch {
    throw new Error("trusted_login_hostname_invalid");
  }
  if (
    parsed.hostname.toLowerCase() !== hostname
    || parsed.username
    || parsed.password
    || parsed.port
    || parsed.pathname !== "/"
  ) throw new Error("trusted_login_hostname_invalid");
  return hostname;
}

/**
 * Server-internal entrypoint for the separately validated cross-origin browser
 * form wrapper. The trusted hostname is a function argument, never a public
 * request header or body field that a caller could spoof. Reconstructing the
 * internal request binds the existing login verifier to that exact hostname
 * while the Next route module itself exports only supported HTTP symbols.
 */
export async function loginWithTrustedChallengeHostname(
  req: NextRequest,
  trustedChallengeHostname: string,
) {
  const url = new URL(req.url);
  url.hostname = exactHostname(trustedChallengeHostname);
  const body = req.body ? await req.arrayBuffer() : undefined;
  const trustedRequest = new NextRequest(url, {
    method: req.method,
    headers: new Headers(req.headers),
    body,
  });
  return loginPost(trustedRequest);
}
