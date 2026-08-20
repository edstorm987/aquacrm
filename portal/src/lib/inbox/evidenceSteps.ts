import type { EvidenceStep } from "@/lib/inbox/resolutionEvidence";

/**
 * What to actually do about each kind of alert.
 *
 * Written per family, in the imperative, assuming the operator has never seen
 * this check before. "Clears when the invoice is paid" is a condition; it does
 * not tell somebody to ring the client whose number is three fields above.
 *
 * Deliberately generic instructions with the specifics filled in by the caller
 * — a step naming the actual client and their actual phone number is what
 * makes the difference, and only the builder has those.
 */
export function stepsFor(
  alertId: string,
  context: { who?: string; contact?: string; amount?: string; when?: string; href?: string } = {},
): EvidenceStep[] {
  const who = context.who ?? "the client";
  const reach = context.contact ? ` on ${context.contact}` : "";

  const table: Array<[string, EvidenceStep[]]> = [
    ["enquiry-classification:", [
      { label: "Read what they actually sent, above." },
      { label: "Decide what the relationship is — sales, supplier, spam or other.", href: context.href },
      { label: "If it is sales, convert them to a client when you are ready." },
    ]],
    ["person-organisation:", [
      { label: "Check the reason given for the suggestion." },
      { label: `Confirm or reject the company on ${who}'s card.`, href: context.href },
    ]],
    ["contact:", [
      { label: `Ring or message ${who}${reach}.` },
      { label: "Record the call or message so the relationship history is right.", href: context.href },
    ]],
    ["invoice:", [
      { label: `Check whether ${who} has actually paid${context.amount ? ` the ${context.amount}` : ""}.` },
      { label: `Chase ${who}${reach} if not.` },
      { label: "Record the payment, or raise a follow-up with a date.", href: context.href },
    ]],
    ["finance:overdue-invoices", [
      { label: "Open the overdue list and check each against your bank." },
      { label: "Chase the ones genuinely unpaid.", href: context.href },
      { label: "Mark the rest paid so they stop firing." },
    ]],
    ["payment-plan:", [
      { label: `Check whether the instalment${context.amount ? ` (${context.amount})` : ""} has landed.` },
      { label: `Chase ${who}${reach} if it has not.` },
      { label: "Record the payment against the plan.", href: context.href },
    ]],
    ["contract-awaiting:", [
      { label: "Confirm the contract was actually sent." },
      { label: `Chase ${who}${reach} for a decision.` },
      { label: "Record accepted or declined once they answer.", href: context.href },
    ]],
    ["portal-access:", [
      { label: "Check the portal is built and published." },
      { label: `Send ${who} their invite${reach}.` },
      { label: "Confirm they signed in — it clears itself once they do.", href: context.href },
    ]],
    ["compliance-expired:", [
      { label: "Find out whether it was actually renewed." },
      { label: "Renew it if not — this is a real exposure, not a reminder." },
      { label: "Update the expiry date and attach the new document.", href: context.href },
    ]],
    ["compliance-due:", [
      { label: "Start the renewal now rather than at the deadline." },
      { label: "Update the record with the new date once done.", href: context.href },
    ]],
    ["compliance-reminder:", [
      { label: "Review the record and decide whether action is needed." },
      { label: "Update its status or push the reminder date.", href: context.href },
    ]],
    ["compliance-action:", [
      { label: "Read what the record says is outstanding." },
      { label: "Do it, then change the status from action-required.", href: context.href },
    ]],
    ["task:", [
      { label: "Do it, or decide it is not worth doing." },
      { label: "Complete, reschedule or reassign it.", href: context.href },
    ]],
    ["external-proposal:", [
      { label: "Read what the assistant proposed and what it based it on." },
      { label: "Accept, park or reject it.", href: context.href },
    ]],
    ["meeting:", [
      { label: `Confirm the meeting with ${who}${reach}.` },
      { label: "Record the outcome afterwards, or mark it a no-show.", href: context.href },
    ]],
    ["prospect-follow-up:", [
      { label: `Make contact with ${who}${reach}.` },
      { label: "Record the attempt, even if they did not answer.", href: context.href },
    ]],
    ["enquiry:", [
      { label: "Read the enquiry and decide whether it is worth answering." },
      { label: "Reply, then mark it handled.", href: context.href },
    ]],
    ["website-message:", [
      { label: "Read the message." },
      { label: "Reply and record the outcome.", href: context.href },
    ]],
    ["request:", [
      { label: `Answer ${who}'s request.` },
      { label: "Update its status so it stops firing.", href: context.href },
    ]],
    ["finance:budget-", [
      { label: "Check what has actually been spent against this pot." },
      { label: "Fund it, amend the allocation, or reduce the commitment.", href: context.href },
    ]],
    ["finance:expense-evidence", [
      { label: "Find the receipt — bank app, email, or the card statement." },
      { label: "Attach it to the expense.", href: context.href },
    ]],
    ["finance:expense-review", [
      { label: "Check the expense is legitimate and correctly categorised." },
      { label: "Approve or reject it.", href: context.href },
    ]],
    ["finance:obligations-overdue", [
      { label: "Check whether it has actually been paid." },
      { label: "Pay it if not — overdue obligations carry penalties." },
      { label: "Record the payment.", href: context.href },
    ]],
    ["finance:obligations-upcoming", [
      { label: "Make sure the money is there for it." },
      { label: "Pay it, or move the date if it has changed.", href: context.href },
    ]],
    ["finance:people-payments-due", [
      { label: "Make the payment." },
      { label: "Record it against the person so payroll history is right.", href: context.href },
    ]],
    ["finance:recurring-expenses", [
      { label: "Check you still use what this pays for." },
      { label: "Confirm, amend or cancel it.", href: context.href },
    ]],
    ["campaign-budget:", [
      { label: "Check the spend against what it returned." },
      { label: "Raise the budget, or pause the campaign.", href: context.href },
    ]],
    ["campaign-target:", [
      { label: "Look at what the spend has actually produced." },
      { label: "Keep it, change it, or stop it — this is your call.", href: context.href },
    ]],
    ["client-marketing-no-leads", [
      { label: "Look at spend against leads attributed." },
      { label: "Decide whether to keep going, change the approach, or stop.", href: context.href },
    ]],
    ["client-marketing-access:", [
      { label: `Ask ${who} to grant access${reach}.` },
      { label: "Re-check the connection once they say they have.", href: context.href },
    ]],
    ["client-marketing-approvals:", [
      { label: "Review what is waiting." },
      { label: "Approve or reject it.", href: context.href },
    ]],
    ["client-marketing-budget:", [
      { label: "Check the spend against the agreed budget." },
      { label: "Amend the budget, or pull the campaign back.", href: context.href },
    ]],
    ["outage:", [
      { label: "Check whether the service is actually down." },
      { label: "If it is, tell the client before they tell you." },
      { label: "Leave it once the service is back — it clears itself.", href: context.href },
    ]],
    ["development:errors:", [
      { label: "Look at what is erroring and how often." },
      { label: "Fix it, or accept it if it is noise." },
    ]],
    ["development:monitoring-stale", [
      { label: "Check whether the monitor is broken or the source is." },
      { label: "Reconnect it — a stale monitor is a blind spot, not a pass." },
    ]],
    ["calendar-reminder:", [
      { label: "Do whatever the reminder is for." },
      { label: "Update the commitment or push the date.", href: context.href },
    ]],
    ["people:", [
      { label: "Open the record and see what is missing or waiting." },
      { label: "Complete it, or make the decision.", href: context.href },
    ]],
  ];

  for (const [prefix, steps] of table) {
    if (alertId.startsWith(prefix)) return steps;
  }

  // Radar and anything unrecognised: honest generic guidance rather than a
  // confident instruction that might be wrong.
  if (alertId.startsWith("radar:") || alertId.startsWith("recommended-radar:") || alertId.startsWith("incident:")) {
    return [
      { label: "Look at the numbers above and decide whether the movement is real." },
      { label: "If it is not worth acting on, dismiss it — that is a valid answer." },
      { label: "If it is, accept it as a task so it gets an owner and a date." },
    ];
  }
  return [
    { label: "Open the record and see what changed.", href: context.href },
    { label: "Act on it, or dismiss it if it is not worth doing." },
  ];
}
