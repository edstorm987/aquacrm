// Notification service. When a submission lands and the form's
// submitAction has notifyEmails or kind === "external-webhook":
//   - Emit a `forms.notification.requested` event with the payload.
//   - If EmailQueuePort is wired, enqueue email notifications.
//   - The actual webhook POST is the foundation event router's job
//     (catalogued as foundation-pending; this plugin emits the event
//     with the webhookUrl in payload).
//
// Email sending delivery itself is agency-marketing's territory in a
// future round. For now, "queue" means "logged + emit event"; even
// when EmailQueuePort.enqueue resolves, no email actually leaves.

import { now } from "../lib/time";
import type { AgencyId, ClientId } from "../lib/tenancy";
import type {
  FormDefinition,
  NotificationRequestedEvent,
  Submission,
} from "../lib/domain";
import type {
  ActivityLogPort,
  EmailQueuePort,
  EventBusPort,
} from "./ports";

export class NotificationService {
  constructor(
    private agencyId: AgencyId,
    private clientId: ClientId | undefined,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    private emailQueue?: EmailQueuePort,
  ) {}

  async dispatch(form: FormDefinition, submission: Submission): Promise<{
    ok: boolean;
    webhookFired: boolean;
    emailsQueued: number;
  }> {
    const action = form.submitAction;
    let webhookFired = false;
    let emailsQueued = 0;

    const occurredAt = now();
    const payload: NotificationRequestedEvent = {
      submissionId: submission.id,
      formId: form.id,
      formName: form.name,
      webhookUrl: action.kind === "external-webhook" ? action.webhookUrl : undefined,
      notifyEmails: action.notifyEmails,
      payload: {
        formId: form.id,
        formName: form.name,
        values: submission.values,
        meta: submission.meta,
      },
      occurredAt,
    };

    // Webhook branch — emit the event; foundation router does the POST.
    if (action.kind === "external-webhook" && action.webhookUrl) {
      this.events.emit(
        { agencyId: this.agencyId, clientId: this.clientId },
        "forms.notification.requested",
        payload,
      );
      webhookFired = true;
      await this.activity.logActivity({
        agencyId: this.agencyId,
        clientId: this.clientId,
        category: "forms",
        action: "forms.notification.requested",
        message: `Webhook notification queued for "${form.name}" → ${action.webhookUrl}.`,
        metadata: { submissionId: submission.id, webhookUrl: action.webhookUrl },
      });
    }

    // Email branch — enqueue per recipient via the optional port.
    // Without the port, we still emit the event so a future router can
    // pick it up.
    if (action.notifyEmails && action.notifyEmails.length > 0) {
      // Always emit an event so the audit trail is complete even when
      // EmailQueuePort isn't wired.
      if (!webhookFired) {
        this.events.emit(
          { agencyId: this.agencyId, clientId: this.clientId },
          "forms.notification.requested",
          payload,
        );
      }
      if (this.emailQueue) {
        const result = await this.emailQueue.enqueue({
          agencyId: this.agencyId,
          clientId: this.clientId,
          request: {
            to: action.notifyEmails,
            subject: `New submission on ${form.name}`,
            bodyText: renderTextSummary(form, submission),
          },
        });
        if (result.ok && result.queued) {
          emailsQueued = action.notifyEmails.length;
        }
      }
      await this.activity.logActivity({
        agencyId: this.agencyId,
        clientId: this.clientId,
        category: "forms",
        action: "forms.notification.requested",
        message: `Email notification${this.emailQueue ? " queued" : " event-only (EmailQueuePort absent)"} for "${form.name}".`,
        metadata: {
          submissionId: submission.id,
          recipientCount: action.notifyEmails.length,
          enqueued: emailsQueued,
        },
      });
    }

    return { ok: true, webhookFired, emailsQueued };
  }
}

function renderTextSummary(form: FormDefinition, submission: Submission): string {
  const lines = [`New submission on ${form.name}`];
  for (const field of form.fields) {
    if (field.kind === "hidden") continue;
    const v = submission.values[field.id];
    if (v === undefined || v === null) continue;
    const display = Array.isArray(v) ? v.join(", ") : v;
    lines.push(`${field.label}: ${display}`);
  }
  lines.push(`Submitted at: ${new Date(submission.meta.submittedAt).toISOString()}`);
  return lines.join("\n");
}
