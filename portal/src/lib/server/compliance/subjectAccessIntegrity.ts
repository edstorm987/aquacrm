import "server-only";

import crypto from "node:crypto";
import { validSubjectAccessIntegrityKeyMaterial } from "@/lib/server/env";
import {
  previousSubjectAccessIntegrityKey,
  subjectAccessIntegrityKey,
} from "@/lib/server/secrets";

export const SUBJECT_ACCESS_INTEGRITY_VERSION = 1;
export const SUBJECT_ACCESS_INTEGRITY_KEY_ID_PATTERN = /^dsar_[a-f0-9]{24}$/;

const TAG_PATTERN = /^[a-f0-9]{64}$/;

export interface SubjectAccessIntegrityStamp {
  tag: string;
  keyId: string;
  keyVersion: number;
}

interface IntegrityKey {
  id: string;
  material: Buffer;
  version: typeof SUBJECT_ACCESS_INTEGRITY_VERSION;
}

/**
 * Configuration failures are operational failures, not request-state facts.
 * Routes deliberately map this to their existing generic 503 response so a
 * missing/retired key never becomes a tenant or request-existence oracle.
 */
export class SubjectAccessIntegrityUnavailableError extends Error {
  constructor() {
    super("subject_access_integrity_unavailable");
    this.name = "SubjectAccessIntegrityUnavailableError";
  }
}

function parseKey(value: string | undefined): IntegrityKey {
  if (!validSubjectAccessIntegrityKeyMaterial(value)) throw new SubjectAccessIntegrityUnavailableError();
  const material = Buffer.from(value!, "base64url");
  const id = `dsar_${crypto.createHash("sha256")
    .update("aqua-dsar-integrity-key-id-v1", "utf8")
    .update(Buffer.from([0]))
    .update(material)
    .digest("hex")
    .slice(0, 24)}`;
  return { id, material, version: SUBJECT_ACCESS_INTEGRITY_VERSION };
}

function configuredKeys(): { current: IntegrityKey; all: readonly IntegrityKey[] } {
  let currentRaw: string | undefined;
  let previousRaw: string | undefined;
  try {
    currentRaw = subjectAccessIntegrityKey();
    previousRaw = previousSubjectAccessIntegrityKey();
  } catch {
    throw new SubjectAccessIntegrityUnavailableError();
  }
  const current = parseKey(currentRaw);
  if (!previousRaw) return { current, all: [current] };
  const previous = parseKey(previousRaw);
  if (previous.id === current.id) throw new SubjectAccessIntegrityUnavailableError();
  return { current, all: [current, previous] };
}

function authenticatedTag(key: IntegrityKey, purpose: string, values: readonly (string | number)[]): string {
  const hmac = crypto.createHmac("sha256", key.material);
  const parts: readonly (string | number)[] = [purpose, ...values];
  // Length-prefix every value so embedded delimiters cannot alias two tuples.
  hmac.update(Buffer.from([SUBJECT_ACCESS_INTEGRITY_VERSION]));
  for (const value of parts) {
    const bytes = Buffer.from(String(value), "utf8");
    const length = Buffer.allocUnsafe(8);
    length.writeBigUInt64BE(BigInt(bytes.length));
    hmac.update(length);
    hmac.update(bytes);
  }
  return hmac.digest("hex");
}

export function signSubjectAccessIntegrity(
  purpose: string,
  values: readonly (string | number)[],
): SubjectAccessIntegrityStamp {
  const { current } = configuredKeys();
  return {
    tag: authenticatedTag(current, purpose, values),
    keyId: current.id,
    keyVersion: current.version,
  };
}

export function verifySubjectAccessIntegrity(
  stamp: SubjectAccessIntegrityStamp,
  purpose: string,
  values: readonly (string | number)[],
): boolean {
  if (!TAG_PATTERN.test(stamp.tag)
    || !SUBJECT_ACCESS_INTEGRITY_KEY_ID_PATTERN.test(stamp.keyId)
    || stamp.keyVersion !== SUBJECT_ACCESS_INTEGRITY_VERSION) return false;
  const key = configuredKeys().all.find(candidate => (
    candidate.id === stamp.keyId && candidate.version === stamp.keyVersion
  ));
  // A well-formed, formerly valid key id that is no longer in the configured
  // rotation window is an availability/configuration failure. Never guess a
  // replacement key or fall back to the session-signing secret.
  if (!key) throw new SubjectAccessIntegrityUnavailableError();
  const expected = Buffer.from(authenticatedTag(key, purpose, values), "hex");
  const actual = Buffer.from(stamp.tag, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
