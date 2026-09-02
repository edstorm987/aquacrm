"use client";

import { useState } from "react";

import type { ChecklistView } from "../server";
import type { Client, PhaseDefinition } from "../lib/tenancy";
import { checklistViewAfterTick } from "../lib/checklistView";
import { isFulfillmentChecklistTick } from "../lib/mutationPayloads";
import { ChecklistColumn } from "./ChecklistColumn";
import { checkedJsonMutation } from "@/lib/client/checkedMutation";

export interface ChecklistWidgetProps {
  client: Client;
  phase: PhaseDefinition;
  view: ChecklistView;
  apiBase: string;
}

// Client-side widget: shows ONLY the client tasks for the current phase,
// editable. Used on `/portal/clients/[clientId]/checklist`.
export function ChecklistWidget(props: ChecklistWidgetProps) {
  const { client, phase, view, apiBase } = props;
  const [currentView, setCurrentView] = useState(view);

  async function tickClient(args: { itemId: string; done: boolean }): Promise<void> {
    const expected = {
      clientId: client.id,
      phaseId: phase.id,
      itemId: args.itemId,
      done: args.done,
    };
    await checkedJsonMutation<unknown>(`${apiBase}/checklist/tick`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(expected),
    }, {
      fallback: "Could not update this checklist item.",
      validate: payload => isFulfillmentChecklistTick(payload, expected),
    });
    setCurrentView(current => checklistViewAfterTick(current, args.itemId, args.done));
  }

  return (
    <section className="fulfillment-client-checklist">
      <header>
        <h1>Your checklist</h1>
        <p>
          You're in the <strong>{phase.label}</strong> phase. Tick items as you complete them — your
          agency sees your progress in real time.
        </p>
      </header>
      <ChecklistColumn
        title="Things to do"
        items={currentView.client}
        done={currentView.clientDone}
        total={currentView.clientTotal}
        editable
        onTick={tickClient}
      />
    </section>
  );
}
