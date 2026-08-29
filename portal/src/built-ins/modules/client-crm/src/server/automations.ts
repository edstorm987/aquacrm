// Automation rules, and the runner that carries them out.
//
// A rule is one trigger and a list of actions, scoped to one pipeline. The
// client builds them on the Automations page; this file decides what fires and
// does the work.
//
// Storage:
//   journey/automations/index      → string[] of automation ids
//   journey/automations/by-id/<id> → Automation
//
// ── Every action is one this module can genuinely perform ────────────────
//
// That was the constraint the action list was chosen under, not a description
// of what happened to be easy. Tags, status, notes and stage moves are direct
// writes through services this file holds. `send-email` emits
// `AUTOMATION_EMAIL_EVENT`, which the email-sender plugin subscribes to — a
// real path, pinned by a test that reads email-sender's own subscription list,
// because the failure otherwise is the worst kind: the rule reports success,
// the event lands nowhere, and no mail is ever sent.
//
// There is no "wait 3 days then…" action. Nothing in this module can be woken
// on a timer, so a delay would be a rule that silently never completes. Time
// is surfaced instead as the stage's `idleAfterDays` flag on the board, which
// is honest about being a marker rather than a promise.
//
// ── Cascades ─────────────────────────────────────────────────────────────
//
// `move-to-stage` can satisfy another rule's `card-entered-stage`. Two rules
// pointing at each other's stages is a loop a client can build by accident in
// under a minute, so the runner carries a depth budget AND a set of the rules
// already fired in this cascade. Both are needed: depth alone still lets a
// three-rule ring spin to the cap on every single move, and the visited set
// alone does not bound a long chain of distinct rules.

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import {
  AUTOMATION_EMAIL_EVENT,
  MAX_AUTOMATION_DEPTH,
  type Automation,
  type AutomationAction,
  type AutomationEmailPayload,
  type AutomationRunOutcome,
  type CreateAutomationInput,
  type UpdateAutomationPatch,
} from "../lib/journey";
import type { ActivityService } from "./activity";
import type { ContactService } from "./contacts";
import type { CardTransition, PipelineService } from "./pipelines";
import type { ActivityLogPort, EventBusPort, PluginInstallStorePort, StoragePort } from "./ports";

const AUTOMATION_INDEX_KEY = "journey/automations/index";
const automationKey = (id: string): string => `journey/automations/by-id/${id}`;

/** Cap on actions per rule — a paste of a thousand tags is not a rule. */
const MAX_ACTIONS_PER_AUTOMATION = 10;

export class AutomationService {
  constructor(
    private agencyId: AgencyId,
    private clientId: ClientId,
    private storage: StoragePort,
    private activityLog: ActivityLogPort,
    private events: EventBusPort,
    private pipelines: PipelineService,
    private contacts: ContactService,
    private activity: ActivityService,
    private pluginInstalls: PluginInstallStorePort,
  ) {}

  // ─── CRUD ──────────────────────────────────────────────────────────────

  async list(pipelineId?: string): Promise<Automation[]> {
    const ids = (await this.storage.get<string[]>(AUTOMATION_INDEX_KEY)) ?? [];
    const out: Automation[] = [];
    for (const id of ids) {
      const row = await this.storage.get<Automation>(automationKey(id));
      if (!row || row.agencyId !== this.agencyId || row.clientId !== this.clientId) continue;
      if (pipelineId && row.pipelineId !== pipelineId) continue;
      out.push(row);
    }
    return out.sort((a, b) => a.createdAt - b.createdAt);
  }

  async get(id: string): Promise<Automation | null> {
    const row = await this.storage.get<Automation>(automationKey(id));
    return row && row.agencyId === this.agencyId && row.clientId === this.clientId ? row : null;
  }

  async create(input: CreateAutomationInput, actor: UserId): Promise<Automation> {
    const name = input.name.trim();
    if (!name) throw new Error("Automation name required.");
    if (input.actions.length === 0) throw new Error("An automation needs at least one action.");
    if (input.actions.length > MAX_ACTIONS_PER_AUTOMATION) {
      throw new Error(`An automation may have at most ${MAX_ACTIONS_PER_AUTOMATION} actions.`);
    }
    const pipeline = await this.pipelines.get(input.pipelineId);
    if (!pipeline) throw new Error("Pipeline not found.");
    this.assertReferencesResolve(pipeline.stages.map(s => s.id), input.trigger, input.actions);

    const ts = now();
    const automation: Automation = {
      id: makeId("auto"),
      agencyId: this.agencyId,
      clientId: this.clientId,
      pipelineId: input.pipelineId,
      name,
      enabled: input.enabled ?? true,
      trigger: input.trigger,
      actions: input.actions,
      createdAt: ts,
      updatedAt: ts,
      runCount: 0,
    };
    await this.storage.set(automationKey(automation.id), automation);
    const ids = (await this.storage.get<string[]>(AUTOMATION_INDEX_KEY)) ?? [];
    await this.storage.set(AUTOMATION_INDEX_KEY, [...ids, automation.id]);
    await this.log(actor, "automation.created", `Automation "${name}" created`, { automationId: automation.id });
    return automation;
  }

  async update(id: string, patch: UpdateAutomationPatch, actor: UserId): Promise<Automation | null> {
    const automation = await this.get(id);
    if (!automation) return null;
    if (patch.name !== undefined && !patch.name.trim()) throw new Error("Automation name required.");
    if (patch.actions && patch.actions.length === 0) throw new Error("An automation needs at least one action.");
    if (patch.actions && patch.actions.length > MAX_ACTIONS_PER_AUTOMATION) {
      throw new Error(`An automation may have at most ${MAX_ACTIONS_PER_AUTOMATION} actions.`);
    }
    const pipeline = await this.pipelines.get(automation.pipelineId);
    if (!pipeline) return null;
    this.assertReferencesResolve(
      pipeline.stages.map(s => s.id),
      patch.trigger ?? automation.trigger,
      patch.actions ?? automation.actions,
    );

    const next: Automation = {
      ...automation,
      name: patch.name?.trim() ?? automation.name,
      enabled: patch.enabled ?? automation.enabled,
      trigger: patch.trigger ?? automation.trigger,
      actions: patch.actions ?? automation.actions,
      updatedAt: now(),
    };
    await this.storage.set(automationKey(id), next);
    await this.log(actor, "automation.updated", `Automation "${next.name}" updated`, { automationId: id });
    return next;
  }

  async delete(id: string, actor: UserId): Promise<boolean> {
    const automation = await this.get(id);
    if (!automation) return false;
    await this.storage.del(automationKey(id));
    const ids = (await this.storage.get<string[]>(AUTOMATION_INDEX_KEY)) ?? [];
    await this.storage.set(AUTOMATION_INDEX_KEY, ids.filter(x => x !== id));
    await this.log(actor, "automation.deleted", `Automation "${automation.name}" deleted`, { automationId: id });
    return true;
  }

  /** Drop every rule belonging to a pipeline. Called when the board goes. */
  async deleteForPipeline(pipelineId: string, actor: UserId): Promise<number> {
    const rules = await this.list(pipelineId);
    for (const rule of rules) await this.delete(rule.id, actor);
    return rules.length;
  }

  /**
   * A rule may only name stages of its own pipeline.
   *
   * Without this a client can build a rule against a stage, delete the stage,
   * and be left with a rule that never fires and gives no clue why. Checked on
   * write so the answer arrives while they are still looking at the form.
   */
  private assertReferencesResolve(
    stageIds: string[],
    trigger: CreateAutomationInput["trigger"],
    actions: AutomationAction[],
  ): void {
    if (trigger.type !== "card-created" && !stageIds.includes(trigger.stageId)) {
      throw new Error("The trigger names a stage that is not on this pipeline.");
    }
    for (const action of actions) {
      if (action.type === "move-to-stage" && !stageIds.includes(action.stageId)) {
        throw new Error("An action moves the card to a stage that is not on this pipeline.");
      }
      if (action.type === "add-tag" || action.type === "remove-tag") {
        if (!action.tag.trim()) throw new Error("A tag action needs a tag.");
      }
      if (action.type === "send-email" && (!action.subject.trim() || !action.body.trim())) {
        throw new Error("An email action needs a subject and a body.");
      }
      if (action.type === "log-note" && !action.text.trim()) {
        throw new Error("A note action needs some text.");
      }
    }
  }

  // ─── The runner ────────────────────────────────────────────────────────

  /**
   * Fire everything this transition satisfies.
   *
   * Returns one outcome per rule that ran, including its failures. The caller
   * shows them: a rule that half-worked is exactly what somebody needs to be
   * told about, and swallowing it here is how "the automation does nothing"
   * becomes unreportable.
   */
  async runForTransition(
    transition: CardTransition,
    actor: UserId,
    depth = 0,
    visited: Set<string> = new Set(),
  ): Promise<AutomationRunOutcome[]> {
    const rules = (await this.list(transition.card.pipelineId)).filter(rule => rule.enabled);
    const outcomes: AutomationRunOutcome[] = [];

    for (const rule of rules) {
      if (!this.triggerMatches(rule, transition)) continue;

      // Already fired in this cascade — a ring stops here rather than at the
      // depth cap, so the common accident costs one pass, not five.
      if (visited.has(rule.id)) continue;

      if (depth >= MAX_AUTOMATION_DEPTH) {
        outcomes.push({
          automationId: rule.id,
          automationName: rule.name,
          actionsRun: 0,
          haltedByDepth: true,
          failures: [],
        });
        continue;
      }

      visited.add(rule.id);
      outcomes.push(...await this.runOne(rule, transition, actor, depth, visited));
    }
    return outcomes;
  }

  private triggerMatches(rule: Automation, transition: CardTransition): boolean {
    switch (rule.trigger.type) {
      case "card-created":
        return transition.fromStageId === null;
      case "card-entered-stage":
        // A newly created card HAS entered its first stage. Treating creation
        // as a non-entry was the first version, and it made "when a card
        // reaches New enquiry, tag them" silently skip every new card.
        return transition.toStageId === rule.trigger.stageId
          && transition.fromStageId !== transition.toStageId;
      case "card-left-stage":
        return transition.fromStageId === rule.trigger.stageId
          && transition.fromStageId !== transition.toStageId;
    }
  }

  private async runOne(
    rule: Automation,
    transition: CardTransition,
    actor: UserId,
    depth: number,
    visited: Set<string>,
  ): Promise<AutomationRunOutcome[]> {
    const outcomes: AutomationRunOutcome[] = [];
    const failures: AutomationRunOutcome["failures"] = [];
    let actionsRun = 0;
    let card = transition.card;

    for (const action of rule.actions) {
      try {
        const cascaded = await this.performAction(action, rule, card, actor, depth, visited);
        actionsRun += 1;
        if (cascaded?.card) card = cascaded.card;
        if (cascaded?.outcomes) outcomes.push(...cascaded.outcomes);
      } catch (error) {
        // One bad action does not abandon the rest of the rule — but it is
        // recorded by name, never swallowed.
        failures.push({ action: action.type, reason: error instanceof Error ? error.message : String(error) });
      }
    }

    const stored = await this.get(rule.id);
    if (stored) {
      await this.storage.set(automationKey(rule.id), {
        ...stored, lastRunAt: now(), runCount: stored.runCount + 1,
      });
    }

    outcomes.unshift({
      automationId: rule.id,
      automationName: rule.name,
      actionsRun,
      failures,
    });
    return outcomes;
  }

  private async performAction(
    action: AutomationAction,
    rule: Automation,
    card: CardTransition["card"],
    actor: UserId,
    depth: number,
    visited: Set<string>,
  ): Promise<{ card?: CardTransition["card"]; outcomes?: AutomationRunOutcome[] } | null> {
    const contact = await this.contacts.get(card.contactId);
    if (!contact) throw new Error("The contact behind this card no longer exists.");

    switch (action.type) {
      case "add-tag": {
        const tag = action.tag.trim();
        if (contact.tags.includes(tag)) return null;
        await this.contacts.update(contact.id, { tags: [...contact.tags, tag] }, actor);
        return null;
      }
      case "remove-tag": {
        const tag = action.tag.trim();
        if (!contact.tags.includes(tag)) return null;
        await this.contacts.update(contact.id, { tags: contact.tags.filter(t => t !== tag) }, actor);
        return null;
      }
      case "set-contact-status": {
        await this.contacts.update(contact.id, { status: action.status }, actor);
        return null;
      }
      case "log-note": {
        await this.activity.addNote(contact.id, action.text, actor);
        return null;
      }
      case "send-email": {
        if (!contact.email) throw new Error("That contact has no email address.");
        // ── Does the agency actually have anything to send WITH? ──────────
        //
        // The runner emits an event; email-sender subscribes to it. If that
        // plugin is not installed for the agency, the event is emitted into an
        // empty room and no mail is ever sent — while the rule reports two
        // actions run and the client waits for a reply that is not coming.
        //
        // Found on 2026-08-28 during the browser walk: the board cheerfully
        // said "Booked — say thanks · 2 actions" for an agency with no
        // email-sender install. Asking first is what makes the receipt true.
        const emailInstall = await this.pluginInstalls.getInstall({ agencyId: this.agencyId }, "email-sender");
        if (!emailInstall || !emailInstall.enabled) {
          throw new Error("Your agency has not set up email sending yet, so no email was sent.");
        }
        if (contact.status === "unsubscribed") {
          // Not a failure of the rule — a correct refusal. It is reported so
          // the client can see why one person did not receive it.
          throw new Error("That contact has unsubscribed, so no email was sent.");
        }
        const payload: AutomationEmailPayload = {
          automationId: rule.id,
          cardId: card.id,
          contactEmail: contact.email,
          contactName: contact.name,
          subject: action.subject,
          bodyText: action.body,
        };
        this.events.emit({ agencyId: this.agencyId, clientId: this.clientId }, AUTOMATION_EMAIL_EVENT, payload);
        return null;
      }
      case "move-to-stage": {
        if (card.stageId === action.stageId) return null;
        const moved = await this.pipelines.moveCard(card.id, action.stageId, undefined, actor);
        if (!moved) throw new Error("The card could not be moved.");
        // The cascade. Depth and the visited set both travel with it.
        const outcomes = await this.runForTransition(moved, actor, depth + 1, visited);
        return { card: moved.card, outcomes };
      }
    }
  }

  private async log(actor: UserId, action: string, message: string, metadata: Record<string, unknown>): Promise<void> {
    await this.activityLog.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "plugin",
      action: `client-crm.${action}`,
      message,
      metadata,
    });
  }
}
