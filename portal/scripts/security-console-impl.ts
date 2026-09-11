// AquaCRM operator security console — the REAL, runnable incident controls.
//
// The incident runbooks used to name TypeScript functions (setGlobalReadOnly,
// suspendUser, …) that an operator cannot execute from a shell. This is that
// shell. Run it in the deployment (Railway → service → shell) with the
// production env so it acts on the live backend:
//
//   node --import tsx scripts/security-console.ts <command> [args] --actor <you> [--reason "..."] --commit
//
// Every mutating command is DRY-RUN by default and prints exactly what it would
// do; add --commit to apply. Read commands (status, sessions) never mutate.
//
// Commands:
//   status
//   freeze            --actor <id> --reason <text> --commit
//   thaw              --actor <id> --commit
//   lockdown-tenant   <agencyId> --actor <id> --reason <text> --commit
//   lift-tenant       <agencyId> --actor <id> --commit
//   suspend-user      <userId> --actor <id> --reason <text> --commit
//   unsuspend-user    <userId> --actor <id> --commit
//   sessions          <userId>
//   revoke-session    <sid> --actor <id> --reason <text> --commit
//   revoke-all        <userId> --actor <id> --reason <text> --commit
//   bump-global-epoch --actor <id> --reason <text> --commit
//   bump-tenant-epoch <agencyId> --actor <id> --reason <text> --commit
//   disable-ai        --actor <id> --reason <text> --commit
//   enable-ai         --actor <id> --commit
//   quarantine-list   [pending|replayed|discarded|all]
//   quarantine-replay <id> --actor <id> --reason <text> --commit
//   quarantine-discard <id> --actor <id> --reason <text> --commit

import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import {
  readSecurityControl,
  readDurableWriteControl,
  setDurableGlobalReadOnly,
  clearDurableGlobalReadOnly,
  setDurableTenantLockdown,
  clearDurableTenantLockdown,
  suspendUser,
  unsuspendUser,
  listUserSessions,
  revokeSession,
  revokeAllUserSessions,
  bumpGlobalSecurityEpoch,
  bumpTenantSecurityEpoch,
  disableAi,
  enableAi,
} from "@/lib/server/auth/securityControl";
import {
  listAuthoritativeWriteQuarantines,
  resolveAuthoritativeWriteQuarantine,
} from "@/lib/server/security/writeAdmission";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const positionals = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && (i === 0 || !all[i - 1]?.startsWith("--")));
const command = positionals[0];
const target = positionals[1];
const actor = arg("--actor") ?? "";
const reason = arg("--reason") ?? "";
const commit = process.argv.includes("--commit");

function requireActor() {
  if (!actor) fail("--actor <id> is required (the operator taking the action, for the durable record).");
}
function requireReason() {
  if (!reason) fail("--reason <text> is required (recorded on the security event).");
}
function requireTarget(name: string) {
  if (!target) fail(`this command needs a ${name} argument.`);
}
function fail(message: string): never {
  console.error(`ERROR: ${message}`);
  process.exit(2);
}
function preview(what: string) {
  if (!commit) {
    console.error(`DRY RUN — would: ${what}\nAdd --commit to apply.`);
    process.exit(0);
  }
}

/**
 * Persist the mutation durably, read the control plane back, and verify the
 * change actually landed. Exits nonzero if it did not — a console that reports
 * success without confirming persistence is worse than useless in an incident.
 */
async function finish(message: string, verify?: (c: ReturnType<typeof readSecurityControl>) => boolean): Promise<void> {
  await flushPendingWrites();
  const persisted = readSecurityControl();
  if (verify && !verify(persisted)) {
    console.error(`FAILED: '${message}' did not persist — the control plane was not updated. Re-run or use the DB directly.`);
    process.exit(1);
  }
  console.error(message);
}

async function main() {
  await ensureHydrated();

  switch (command) {
    case "status": {
      const c = readSecurityControl();
      const durable = await readDurableWriteControl(target);
      console.log(JSON.stringify({
        globalReadOnly: durable.global,
        tenantWriteControl: durable.tenant,
        pendingWriteQuarantines: durable.pendingQuarantines,
        aiDisabled: c.aiDisabled ?? null,
        globalEpoch: c.globalEpoch,
        tenantLockdowns: Object.keys(c.tenantLockdowns ?? {}),
        suspendedUsers: Object.keys(c.suspendedUsers ?? {}),
        tenantEpochs: c.tenantEpochs,
        sessionsTracked: Object.keys(c.sessions ?? {}).length,
      }, null, 2));
      return;
    }
    case "quarantine-list": {
      const requested = target === "all" ? null : target || "pending";
      if (requested !== null && requested !== "pending" && requested !== "replayed" && requested !== "discarded") {
        fail("quarantine-list status must be pending, replayed, discarded or all.");
      }
      console.log(JSON.stringify(await listAuthoritativeWriteQuarantines(requested), null, 2));
      return;
    }
    case "quarantine-replay":
    case "quarantine-discard": {
      requireTarget("quarantine id"); requireActor(); requireReason();
      const id = Number(target);
      if (!Number.isSafeInteger(id) || id < 1) fail("quarantine id must be a positive integer.");
      const action = command === "quarantine-replay" ? "replay" : "discard";
      preview(`${action} quarantined PortalState write #${id}`);
      const quarantine = (await listAuthoritativeWriteQuarantines("pending")).find(item => item.id === id);
      if (!quarantine) fail(`pending quarantine #${id} was not found.`);
      const snapshot = await readDurableWriteControl(
        quarantine.controlScope === "tenant" ? quarantine.controlScopeId : undefined,
      );
      const control = quarantine.controlScope === "tenant" ? snapshot.tenant : snapshot.global;
      if (!control) fail(`the ${quarantine.controlScope} control row for quarantine #${id} is unavailable.`);
      if (action === "replay" && control.frozen) {
        fail(`the ${quarantine.controlScope} control is still frozen; thaw it, then re-run replay with a fresh revision check.`);
      }
      const result = await resolveAuthoritativeWriteQuarantine({
        id,
        action,
        actor,
        reason,
        expectedControlRevision: control.revision,
      });
      console.error(`Quarantine #${result.id} ${result.status} at control revision ${result.controlRevision}. Restart fenced workers after all pending quarantines are resolved.`);
      return;
    }
    case "freeze":
      requireActor(); requireReason(); preview(`set GLOBAL READ-ONLY (reason: ${reason})`);
      await setDurableGlobalReadOnly(actor, reason); console.error("Global read-only ON (durable)."); return;
    case "thaw":
      requireActor(); preview("clear GLOBAL READ-ONLY");
      await clearDurableGlobalReadOnly(actor); console.error("Global read-only OFF (durable)."); return;
    case "lockdown-tenant":
      requireTarget("agencyId"); requireActor(); requireReason(); preview(`lock down tenant ${target}`);
      await setDurableTenantLockdown(target!, actor, reason); await finish(`Tenant ${target} locked down.`, c => Boolean(c.tenantLockdowns?.[target!])); return;
    case "lift-tenant":
      requireTarget("agencyId"); requireActor(); preview(`lift lockdown on tenant ${target}`);
      await clearDurableTenantLockdown(target!, actor); await finish(`Tenant ${target} lockdown lifted.`, c => !c.tenantLockdowns?.[target!]); return;
    case "suspend-user":
      requireTarget("userId"); requireActor(); requireReason(); preview(`suspend user ${target}`);
      suspendUser(target!, actor, reason); await finish(`User ${target} suspended.`, c => Boolean(c.suspendedUsers?.[target!])); return;
    case "unsuspend-user":
      requireTarget("userId"); requireActor(); preview(`unsuspend user ${target}`);
      unsuspendUser(target!, actor); await finish(`User ${target} unsuspended.`, c => !c.suspendedUsers?.[target!]); return;
    case "sessions":
      requireTarget("userId");
      console.log(JSON.stringify(listUserSessions(target!), null, 2)); return;
    case "revoke-session":
      requireTarget("sid"); requireActor(); requireReason(); preview(`revoke session ${target}`);
      revokeSession(target!, actor, reason); await finish(`Session ${target} revoked.`, c => Boolean(c.sessions?.[target!]?.revokedAt)); return;
    case "revoke-all":
      requireTarget("userId"); requireActor(); requireReason(); preview(`revoke ALL sessions for user ${target}`);
      revokeAllUserSessions(target!, actor, reason); await finish(`All sessions for ${target} revoked.`); return;
    case "bump-global-epoch":
      requireActor(); requireReason(); preview("bump the GLOBAL security epoch (logs out everyone)");
      const g = bumpGlobalSecurityEpoch(actor, reason); await finish(`Global epoch now ${g}.`, c => c.globalEpoch >= g); return;
    case "bump-tenant-epoch":
      requireTarget("agencyId"); requireActor(); requireReason(); preview(`bump tenant epoch for ${target}`);
      const t = bumpTenantSecurityEpoch(target!, actor, reason); await finish(`Tenant ${target} epoch now ${t}.`, c => (c.tenantEpochs?.[target!] ?? 0) >= t); return;
    case "disable-ai":
      requireActor(); requireReason(); preview(`disable AI generation (reason: ${reason})`);
      disableAi(actor, reason); await finish("AI generation DISABLED.", c => Boolean(c.aiDisabled)); return;
    case "enable-ai":
      requireActor(); preview("re-enable AI generation");
      enableAi(actor); await finish("AI generation ENABLED.", c => !c.aiDisabled); return;
    default:
      fail(`unknown command '${command ?? "(none)"}'. Run with no args to see usage in the header, or 'status'.`);
  }
}

main().catch(error => {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
