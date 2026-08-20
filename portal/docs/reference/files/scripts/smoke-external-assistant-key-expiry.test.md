# `scripts/smoke-external-assistant-key-expiry.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** An EXPIRED external-assistant key must grant nothing.  The suite covered revocation and never expiry, and "active" is implemented twice with different code: `findExternalAssistantApiKey` delegates to `keyStatus` (revokedAt, then expiresAt), while `authenticateExternalAssistant` re-derives the same rule inline for its `hasManagedKeys` check. Two copies, one test between them.  The Dev Console's API view tells the reader, in as many words, that a non-active key "grants nothing: every call with it is rejected at authentication, before any tool is reached". Nothing in the suite backed that claim for the expired half — so simplifying the filter to `!key.revokedAt` (the shape already written inline in `externalAssistantApi.ts`) would leave a 30-day key authenticating forever while the screen renders an "expired" badge, with 1,900+ tests still green.

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

