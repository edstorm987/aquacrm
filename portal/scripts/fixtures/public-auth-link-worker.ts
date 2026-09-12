import { preparePublicAuthLinkDelivery } from "../../src/server/publicAuthLinkDelivery";

async function main() {
  const presentation = process.argv[2] ?? "/portal/customer";
  const operation = await preparePublicAuthLinkDelivery({
    kind: "magic-link",
    userId: "usr_cross_process_magic",
    email: "cross-process-magic@example.test",
    agencyId: "agency_cross_process_magic",
    clientId: "client_cross_process_magic",
    sessionRev: 7,
    presentation,
  });

  process.stdout.write(JSON.stringify({
    id: operation.id,
    generation: operation.generation,
    nonce: operation.tokenNonce,
    exp: operation.tokenExpiresAt,
    providerOperationRef: operation.providerOperationRef,
    presentation: operation.presentation,
  }));
}

void main().catch(error => {
  process.stderr.write(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
