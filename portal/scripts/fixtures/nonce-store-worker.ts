import { getNonceStore } from "../../src/lib/server/auth/nonceStore";

const token = process.argv[2];
if (!token) throw new Error("token required");
void getNonceStore().consumeNonce(token, "magic-link", 60_000).then(consumed => {
  process.stdout.write(JSON.stringify(consumed));
}).catch(error => {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
