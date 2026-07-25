export const TOOL_COPY: Record<string, { name: string; description: string }> = {
  fulfillment: {
    name: "Project pipeline",
    description: "Stages, checklists, internal tasks, and client-facing progress for the build.",
  },
  "website-editor": {
    name: "Website and portal builder",
    description: "Build and preview the client website, portal pages, assets, sections, and launch variants.",
  },
  ecommerce: {
    name: "E-commerce",
    description: "Products, checkout, orders, customers, discounts, inventory, and shipping.",
  },
  memberships: {
    name: "Memberships",
    description: "Recurring plans, gated benefits, member access, and subscription tracking.",
  },
  affiliates: {
    name: "Affiliates",
    description: "Referral codes, attribution, commission tracking, and partner payouts.",
  },
  "client-crm": {
    name: "Client CRM",
    description: "Contacts, customer notes, segments, account history, and support context.",
  },
  "agency-marketing": {
    name: "Marketing",
    description: "Campaigns, templates, touchpoints, lead follow-up, and growth reporting.",
  },
  "email-sender": {
    name: "Email",
    description: "Sender identity, outbox, delivery logs, and client communication email flows.",
  },
  "agency-finance": {
    name: "Finance",
    description: "Invoices, payments, plans, expenses, lock-ins, and revenue reporting.",
  },
  "agency-hr": {
    name: "Team",
    description: "Team members, roles, permissions, departments, and leave requests.",
  },
  "public-funnel": {
    name: "Lead capture",
    description: "Public forms and website capture flows that feed new prospects into the agency.",
  },
  "leads-pipeline": {
    name: "Sales pipeline",
    description: "Contacts, meetings, proposals, follow-ups, and lead-to-client conversion.",
  },
  "bos-auth-gate": {
    name: "Client sign-in",
    description: "Private access, dev bypass, and secure handoff into the client workspace.",
  },
};

export function toolCopy(tool: { id: string; name?: string; description?: string }) {
  return TOOL_COPY[tool.id] ?? {
    name: tool.name ?? tool.id,
    description: "Built-in workspace system for this client.",
  };
}
