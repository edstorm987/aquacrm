// Checklist progress tracker.
//
// `PhaseDefinition.checklist` carries the **template** (id, label,
// visibility). The per-client `done` state lives in plugin-namespaced
// storage under the key:
//
//     progress:<clientId>:<phaseId>
//
// The shape stored is `ChecklistProgress` — a map keyed by templateItem.id
// with timestamp + actor metadata, so a phase advance can audit who ticked
// what and when.

import { now } from "../lib/time";
import type {
  AgencyId,
  ClientId,
  PhaseChecklistItem,
  PhaseDefinition,
  UserId,
} from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { EventBusPort } from "./ports";

export interface ChecklistItemState {
  done: boolean;
  doneAt?: number;
  doneBy?: UserId;
  notes?: string;
}

export interface ChecklistProgress {
  clientId: ClientId;
  phaseId: string;
  items: Record<string, ChecklistItemState>;
  updatedAt: number;
}

export interface ChecklistView {
  internal: ChecklistViewItem[];
  client: ChecklistViewItem[];
  internalDone: number;
  internalTotal: number;
  clientDone: number;
  clientTotal: number;
  allRequiredComplete: boolean;
}

export interface ChecklistViewItem extends PhaseChecklistItem {
  done: boolean;
  doneAt?: number;
  doneBy?: UserId;
  notes?: string;
}

export class ChecklistService {
  constructor(
    private storage: PluginStorage,
    private events: EventBusPort,
  ) {}

  private storageKey(clientId: ClientId, phaseId: string): string {
    return `progress:${clientId}:${phaseId}`;
  }

  async getProgress(clientId: ClientId, phaseId: string): Promise<ChecklistProgress> {
    const stored = await this.storage.get<ChecklistProgress>(this.storageKey(clientId, phaseId));
    if (stored) return stored;
    return {
      clientId,
      phaseId,
      items: {},
      updatedAt: now(),
    };
  }

  async setProgress(progress: ChecklistProgress): Promise<void> {
    const next: ChecklistProgress = { ...progress, updatedAt: now() };
    await this.storage.set(this.storageKey(progress.clientId, progress.phaseId), next);
  }

  // Compose template + progress into a render-ready view. Pages call this
  // to build the two-column phase board.
  async viewFor(args: {
    agencyId: AgencyId;
    clientId: ClientId;
    phase: PhaseDefinition;
  }): Promise<ChecklistView> {
    const progress = await this.getProgress(args.clientId, args.phase.id);
    const internal: ChecklistViewItem[] = [];
    const client: ChecklistViewItem[] = [];
    for (const item of args.phase.checklist) {
      const state = progress.items[item.id];
      const view: ChecklistViewItem = {
        ...item,
        done: state?.done ?? false,
        doneAt: state?.doneAt,
        doneBy: state?.doneBy,
        notes: state?.notes,
      };
      if (item.visibility === "internal") internal.push(view);
      else client.push(view);
    }
    const internalDone = internal.filter(i => i.done).length;
    const clientDone = client.filter(i => i.done).length;
    return {
      internal,
      client,
      internalDone,
      internalTotal: internal.length,
      clientDone,
      clientTotal: client.length,
      // Phase advance gate: everything internal AND client must be done.
      // Agency owners can override via "Advance anyway" from the UI; the
      // gate just toggles the button's default state.
      allRequiredComplete:
        internalDone === internal.length && clientDone === client.length,
    };
  }

  async tickItem(args: {
    agencyId: AgencyId;
    clientId: ClientId;
    phase: PhaseDefinition;
    itemId: string;
    done: boolean;
    actor?: UserId;
    notes?: string;
  }): Promise<ChecklistProgress> {
    const item = args.phase.checklist.find(i => i.id === args.itemId);
    if (!item) {
      throw new Error(`Checklist item ${args.itemId} not in phase ${args.phase.id}.`);
    }
    const current = await this.getProgress(args.clientId, args.phase.id);
    const nextItems = { ...current.items };
    if (args.done) {
      nextItems[args.itemId] = {
        done: true,
        doneAt: now(),
        doneBy: args.actor,
        notes: args.notes,
      };
    } else {
      // Untick — keep the entry so we can show "previously done at X" if needed.
      nextItems[args.itemId] = {
        done: false,
        doneAt: undefined,
        doneBy: undefined,
        notes: args.notes,
      };
    }
    const next: ChecklistProgress = {
      clientId: args.clientId,
      phaseId: args.phase.id,
      items: nextItems,
      updatedAt: now(),
    };
    await this.setProgress(next);
    if (args.done) {
      this.events.emit(
        { agencyId: args.agencyId, clientId: args.clientId },
        "phase.checklist_item_completed",
        {
          phaseId: args.phase.id,
          itemId: args.itemId,
          itemLabel: item.label,
          visibility: item.visibility,
          actor: args.actor,
        },
      );
    }
    return next;
  }

  // Initialise a fresh progress row for a (client, phase) pair. Called
  // when a client enters a phase so the progress key exists with all
  // template items at `done: false`.
  async initialiseFor(args: {
    clientId: ClientId;
    phase: PhaseDefinition;
  }): Promise<ChecklistProgress> {
    const items: Record<string, ChecklistItemState> = {};
    for (const tpl of args.phase.checklist) {
      items[tpl.id] = { done: false };
    }
    const progress: ChecklistProgress = {
      clientId: args.clientId,
      phaseId: args.phase.id,
      items,
      updatedAt: now(),
    };
    await this.setProgress(progress);
    return progress;
  }
}
