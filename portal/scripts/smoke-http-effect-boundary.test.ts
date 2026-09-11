import assert from "node:assert/strict";
import test from "node:test";

import {
  clearGlobalReadOnly,
  isGlobalReadOnly,
  setGlobalReadOnly,
  WritesFrozenError,
} from "../src/lib/server/auth/securityControl";
import { sendTransactionalEmail } from "../src/lib/server/email/transactionalEmail";

test("the central email provider seam refuses before delivery during read-only containment", async () => {
  if (isGlobalReadOnly()) clearGlobalReadOnly("test-reset");
  setGlobalReadOnly("test-incident-controller", "provider-effect boundary test");
  try {
    await assert.rejects(
      sendTransactionalEmail({
        agencyId: "effect-boundary-agency",
        to: "recipient@example.test",
        subject: "Must not send",
        bodyText: "Must not send",
        bodyHtml: "<p>Must not send</p>",
        externalRef: "effect-boundary-test",
      }),
      WritesFrozenError,
    );
  } finally {
    clearGlobalReadOnly("test-incident-controller");
  }
});
