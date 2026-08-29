// Journey pipelines — the client's own kanban, and the automations behind it.
//
// Ed, 28 August 2026: *"give them a kanban board as well so that they can
// create their own journey pipelines and move contacts about and set
// automations and more"*.
//
// This is the client-side mirror of what the agency has in Journey. A client
// builds their OWN stages ("Enquired → Quoted → Booked"), drops their contacts
// on the board, and hangs rules off the stages. It is a per-client add-on: the
// whole thing switches off with the `journey-pipelines` feature flag, exactly
// like the editor's features do.
//
// ── What a card points AT, and why it matters ────────────────────────────
//
// A card references a `contactId` — a Contact row in this plugin's own
// storage. It deliberately does NOT reference a client-form enquiry.
//
// Enquiries live in the CLIENT's own Supabase and are read live, never copied
// (`src/lib/server/clientForms/clientFormReader.ts` states that rule and this
// file does not get to weaken it). If a card could point at one, the board
// would need that person's identity in OUR storage to draw a lane — which is
// the copy that rule forbids. So enquiries are shown in the Inbox as the live
// read they are, and a client who wants one on the board adds it as a Contact,
// which is an explicit act with an obvious meaning: this person is now mine to
// track. The Inbox offers that as a one-click "Add to pipeline".
//
// ── Stage kind ───────────────────────────────────────────────────────────
//
// Stages carry a `kind` rather than the board inferring meaning from a name.
// "Won" is not a spelling — a pipeline in another language, or one that calls
// it "Booked", still needs the board to know which column is the end. Metrics
// and the `card-won` trigger read `kind`, never the label.

import type { AgencyId, ClientId } from "./tenancy";

// ─── Pipeline and stages ─────────────────────────────────────────────────

/**
 * What reaching this stage MEANS, independent of what it is called.
 * `open` is an ordinary step; `won` and `lost` are terminal outcomes.
 */
export type StageKind = "open" | "won" | "lost";

export interface PipelineStage {
  id: string;
  name: string;
  /** Board column order, ascending. Contiguous after every mutation. */
  order: number;
  kind: StageKind;
  /** Column accent. One of the named board tones, not a raw colour, so a
   *  client cannot pick an unreadable value against either theme. */
  tone: StageTone;
  /** Flag a card that has sat here longer than this. Unset = never flag. */
  idleAfterDays?: number;
}

export type StageTone = "slate" | "blue" | "teal" | "amber" | "violet" | "green" | "red";

export const STAGE_TONES: readonly StageTone[] = [
  "slate", "blue", "teal", "amber", "violet", "green", "red",
] as const;

export interface Pipeline {
  id: string;
  agencyId: AgencyId;
  clientId: ClientId;
  name: string;
  description?: string;
  stages: PipelineStage[];
  /** The board opened when none is named. Exactly one per client. */
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CreatePipelineInput {
  name: string;
  description?: string;
  /** Omitted → the starter board below. */
  stages?: Array<Pick<PipelineStage, "name" | "kind" | "tone"> & { idleAfterDays?: number }>;
  isDefault?: boolean;
}

export interface UpdatePipelinePatch {
  name?: string;
  description?: string;
  isDefault?: boolean;
}

/**
 * The board a new pipeline starts as.
 *
 * Not empty, because an empty kanban is a dead end — there is nowhere to drop
 * anything and no hint of what a stage is for. Not elaborate either: five
 * columns anyone running a service business recognises, which a client renames
 * or deletes in a click.
 */
export const STARTER_STAGES: ReadonlyArray<Pick<PipelineStage, "name" | "kind" | "tone"> & { idleAfterDays?: number }> = [
  { name: "New enquiry", kind: "open", tone: "blue", idleAfterDays: 3 },
  { name: "Contacted", kind: "open", tone: "teal", idleAfterDays: 7 },
  { name: "Quoted", kind: "open", tone: "amber", idleAfterDays: 14 },
  { name: "Won", kind: "won", tone: "green" },
  { name: "Lost", kind: "lost", tone: "red" },
] as const;

// ─── Cards ───────────────────────────────────────────────────────────────

export interface JourneyCard {
  id: string;
  agencyId: AgencyId;
  clientId: ClientId;
  pipelineId: string;
  stageId: string;
  /** The Contact this card is about. Always a row in this plugin's storage. */
  contactId: string;
  /** Position within its stage, ascending. Contiguous after every move. */
  position: number;
  /** What the card is worth, in minor units. Unset = untracked, not zero —
   *  a board used for onboarding has no value and must not total to £0.00. */
  valueMinor?: number;
  currency?: string;
  note?: string;
  /** When it arrived in its CURRENT stage. Resets on every move, which is what
   *  makes "idle for 8 days" mean time-in-stage rather than age. */
  enteredStageAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreateCardInput {
  pipelineId: string;
  contactId: string;
  /** Omitted → the first stage of the pipeline. */
  stageId?: string;
  valueMinor?: number;
  currency?: string;
  note?: string;
}

export interface MoveCardInput {
  cardId: string;
  toStageId: string;
  /** Where in the destination column. Omitted → the end. */
  toPosition?: number;
}

export interface UpdateCardPatch {
  valueMinor?: number | null;
  currency?: string;
  note?: string;
}

// ─── Automations ─────────────────────────────────────────────────────────
//
// A rule is one trigger and a list of actions, scoped to one pipeline.
//
// Every action below does something this module can genuinely carry out with
// the ports it holds. That was the deciding constraint on the list: an action
// the runner cannot perform is worse than a missing feature, because the rule
// sits in the list looking armed. `send-email` earns its place because the
// email-sender plugin subscribes to a declared cross-plugin event — see
// `AUTOMATION_EMAIL_EVENT` below.

export type AutomationTrigger =
  | { type: "card-created" }
  | { type: "card-entered-stage"; stageId: string }
  | { type: "card-left-stage"; stageId: string };

export type AutomationAction =
  | { type: "add-tag"; tag: string }
  | { type: "remove-tag"; tag: string }
  | { type: "set-contact-status"; status: "active" | "unsubscribed" }
  | { type: "move-to-stage"; stageId: string }
  | { type: "log-note"; text: string }
  | { type: "send-email"; subject: string; body: string };

export interface Automation {
  id: string;
  agencyId: AgencyId;
  clientId: ClientId;
  pipelineId: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  createdAt: number;
  updatedAt: number;
  /** Observability, so a client can tell a silent rule from an idle one. */
  lastRunAt?: number;
  runCount: number;
}

export interface CreateAutomationInput {
  pipelineId: string;
  name: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  enabled?: boolean;
}

export interface UpdateAutomationPatch {
  name?: string;
  enabled?: boolean;
  trigger?: AutomationTrigger;
  actions?: AutomationAction[];
}

/**
 * The event `send-email` emits, and email-sender subscribes to.
 *
 * Declared here as a constant rather than written as a string at the emit
 * site, so the name cannot drift from the subscriber. A test asserts
 * email-sender's `EVENT_SUBSCRIPTIONS` still contains exactly this value — the
 * failure mode otherwise is silent: automations report success, the event goes
 * nowhere, and no email is ever sent.
 */
export const AUTOMATION_EMAIL_EVENT = "crm.automation.email_requested";

export interface AutomationEmailPayload {
  automationId: string;
  cardId: string;
  contactEmail: string;
  contactName?: string;
  subject: string;
  bodyText: string;
}

/**
 * How many times one movement may cascade.
 *
 * A `move-to-stage` action can satisfy another rule's `card-entered-stage`
 * trigger, and two rules pointing at each other's stages is a loop a client
 * can build by accident in under a minute. The runner stops at this depth and
 * records that it did, rather than either hanging or silently dropping the
 * tail — a cascade that quietly stops halfway is indistinguishable from a rule
 * that did not fire.
 */
export const MAX_AUTOMATION_DEPTH = 5;

export interface AutomationRunOutcome {
  automationId: string;
  automationName: string;
  actionsRun: number;
  /** Present when the runner declined to go deeper. */
  haltedByDepth?: boolean;
  /** Actions that could not be carried out, with the reason. Never silent. */
  failures: Array<{ action: AutomationAction["type"]; reason: string }>;
}

// ─── Board projection ────────────────────────────────────────────────────
//
// What a board render needs, assembled server-side. The page does not fetch
// contacts separately and join them in the browser — that join is where an
// N+1 and a flash of "unknown contact" both come from.

export interface BoardCard extends JourneyCard {
  contactName?: string;
  contactEmail: string;
  contactTags: string[];
  /** True when the stage sets `idleAfterDays` and this card has exceeded it. */
  idle: boolean;
  idleDays: number;
}

export interface BoardStage extends PipelineStage {
  cards: BoardCard[];
  /** Only over cards that actually carry a value — see `valueMinor`. */
  valueMinor: number;
  valuedCardCount: number;
}

export interface JourneyBoard {
  pipeline: Pipeline;
  stages: BoardStage[];
  totalCards: number;
  /** Currency of the board, when every valued card agrees on one. Mixed
   *  currencies report `undefined` rather than totalling incomparable money. */
  currency?: string;
  mixedCurrency: boolean;
}
