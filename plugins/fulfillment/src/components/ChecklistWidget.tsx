"use client";

import type { ChecklistView } from "../server";
import type { Client, PhaseDefinition } from "../lib/tenancy";
import { ChecklistColumn } from "./ChecklistColumn";

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

  async function tickClient(args: { itemId: string; done: boolean }): Promise<void> {
    const res = await fetch(`${apiBase}/checklist/tick`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: client.id,
        phaseId: phase.id,
        itemId: args.itemId,
        done: args.done,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
        items={view.client}
        done={view.clientDone}
        total={view.clientTotal}
        editable
        onTick={tickClient}
      />
    </section>
  );
}
