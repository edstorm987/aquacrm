export type IntegrationProvider = "resend" | "smtp" | "twilio" | "stripe" | "github" | "vercel" | "openai" | "google-search-console";

export type IntegrationFieldKind = "text" | "email" | "url" | "password";

export interface IntegrationFieldDefinition {
  id: string;
  label: string;
  kind: IntegrationFieldKind;
  secret?: boolean;
  required?: boolean;
  placeholder?: string;
  help: string;
}

export interface IntegrationDefinition {
  id: IntegrationProvider;
  name: string;
  category: "Communication" | "Payments" | "Development" | "Intelligence";
  description: string;
  setupUrl: string;
  setupLabel: string;
  outcome: string;
  fields: IntegrationFieldDefinition[];
}

export const INTEGRATION_CATALOG: IntegrationDefinition[] = [
  {
    id: "resend",
    name: "Resend",
    category: "Communication",
    description: "Send access links, account messages and enquiry notifications from a verified address.",
    setupUrl: "https://resend.com/api-keys",
    setupLabel: "Create a Resend key",
    outcome: "AquaCRM will use this connection for customer email and form notifications in the selected scope.",
    fields: [
      { id: "apiKey", label: "API key", kind: "password", secret: true, required: true, placeholder: "re_...", help: "Create an API key in Resend and paste it here." },
      { id: "fromEmail", label: "Sender email", kind: "email", required: true, placeholder: "hello@your-domain.com", help: "This address must belong to a domain verified in Resend." },
      { id: "fromName", label: "Sender name", kind: "text", required: true, placeholder: "AquaOasis-Web", help: "The name customers see beside the sender address." },
      { id: "replyTo", label: "Reply-to email", kind: "email", placeholder: "support@your-domain.com", help: "Replies will go here. Leave blank to use the sender email." },
      { id: "notifyTo", label: "Enquiry notification email", kind: "email", placeholder: "you@your-domain.com", help: "New public enquiries are forwarded to this inbox." },
    ],
  },
  {
    id: "smtp",
    name: "SMTP email",
    category: "Communication",
    description: "Send customer replies through an existing mailbox or transactional SMTP service.",
    setupUrl: "https://en.wikipedia.org/wiki/Simple_Mail_Transfer_Protocol",
    setupLabel: "Review SMTP requirements",
    outcome: "AquaCRM can send enquiry replies from the selected mailbox while retaining every delivery attempt in the contact history.",
    fields: [
      { id: "host", label: "SMTP host", kind: "text", required: true, placeholder: "smtp.example.com", help: "The outgoing mail server supplied by your email provider." },
      { id: "port", label: "SMTP port", kind: "text", required: true, placeholder: "587", help: "Usually 587 for STARTTLS or 465 for implicit TLS." },
      { id: "username", label: "Username", kind: "text", required: true, placeholder: "hello@example.com", help: "The SMTP login username." },
      { id: "password", label: "Password", kind: "password", secret: true, required: true, placeholder: "App password", help: "Use an app-specific password or restricted SMTP credential." },
      { id: "fromEmail", label: "Sender email", kind: "email", required: true, placeholder: "hello@example.com", help: "The address customers will see as the sender." },
      { id: "fromName", label: "Sender name", kind: "text", required: true, placeholder: "AquaOasis-Web", help: "The name displayed beside the sender address." },
      { id: "replyTo", label: "Reply-to email", kind: "email", placeholder: "support@example.com", help: "Replies return here. Leave blank to use the sender email." },
    ],
  },
  {
    id: "twilio",
    name: "Twilio messaging",
    category: "Communication",
    description: "Send SMS and WhatsApp replies from Master Inbox using verified Twilio senders.",
    setupUrl: "https://console.twilio.com/",
    setupLabel: "Open Twilio Console",
    outcome: "Phone enquiries can be answered by text or WhatsApp from the same retained communication history.",
    fields: [
      { id: "accountSid", label: "Account SID", kind: "text", required: true, placeholder: "AC...", help: "The Account SID shown in the Twilio Console." },
      { id: "authToken", label: "Auth token", kind: "password", secret: true, required: true, placeholder: "Twilio auth token", help: "AquaCRM encrypts this token in the integration vault." },
      { id: "smsFrom", label: "SMS sender number", kind: "text", placeholder: "+44...", help: "An SMS-capable Twilio number in E.164 format." },
      { id: "whatsappFrom", label: "WhatsApp sender number", kind: "text", placeholder: "+44...", help: "The WhatsApp-enabled number approved for this Twilio account." },
      { id: "voiceFrom", label: "Voice caller ID", kind: "text", placeholder: "+44...", help: "An outbound voice-capable Twilio number customers should see when you call." },
      { id: "agentPhone", label: "Your answering phone", kind: "text", placeholder: "+44...", help: "Twilio rings this private number first, then bridges the customer using the selected caller ID." },
    ],
  },
  {
    id: "stripe",
    name: "Stripe",
    category: "Payments",
    description: "Create payment links, reconcile card payments and manage recurring billing.",
    setupUrl: "https://dashboard.stripe.com/apikeys",
    setupLabel: "Open Stripe API keys",
    outcome: "Invoices in the selected scope can create Stripe checkout sessions and reconcile signed webhooks.",
    fields: [
      { id: "secretKey", label: "Secret key", kind: "password", secret: true, required: true, placeholder: "sk_live_... or sk_test_...", help: "Use a restricted key where possible. Test keys keep all payments in Stripe test mode." },
      { id: "webhookSecret", label: "Webhook signing secret", kind: "password", secret: true, required: true, placeholder: "whsec_...", help: "Create a webhook for the AquaCRM Stripe endpoint, then paste its signing secret." },
    ],
  },
  {
    id: "github",
    name: "GitHub",
    category: "Development",
    description: "Create and publish private customer repositories from Development.",
    setupUrl: "https://github.com/settings/personal-access-tokens/new",
    setupLabel: "Create a fine-grained token",
    outcome: "AquaCRM can publish provisioned projects to the selected user or organisation without exposing the token.",
    fields: [
      { id: "token", label: "Fine-grained token", kind: "password", secret: true, required: true, placeholder: "github_pat_...", help: "Grant only the repository permissions needed to create and push customer projects." },
      { id: "owner", label: "Repository owner", kind: "text", placeholder: "edstorm987", help: "Optional GitHub user or organisation. The authenticated user is used when blank." },
    ],
  },
  {
    id: "vercel",
    name: "Vercel",
    category: "Development",
    description: "Create customer previews and deployments from the Development workspace.",
    setupUrl: "https://vercel.com/account/settings/tokens",
    setupLabel: "Create a Vercel token",
    outcome: "AquaCRM can deploy provisioned customer projects to the selected Vercel account or team.",
    fields: [
      { id: "token", label: "Access token", kind: "password", secret: true, required: true, placeholder: "Vercel token", help: "Create a token for the account that owns the customer projects." },
      { id: "teamId", label: "Team ID", kind: "text", placeholder: "team_...", help: "Optional. Add this when deployments belong to a Vercel team rather than your personal account." },
    ],
  },
  {
    id: "google-search-console",
    name: "Google Search Console",
    category: "Development",
    description: "Combine organic search queries, landing pages, clicks and positions with consent-aware Aqua Tag activity.",
    setupUrl: "https://console.cloud.google.com/iam-admin/serviceaccounts",
    setupLabel: "Create a Google service account",
    outcome: "Search performance is pulled server-side and joined to the selected Aqua Tag property. Google credentials never enter the website tag.",
    fields: [
      { id: "siteUrl", label: "Search Console property", kind: "text", required: true, placeholder: "sc-domain:example.com", help: "Use the exact property shown in Search Console, including sc-domain: for domain properties." },
      { id: "propertyId", label: "Aqua property ID", kind: "text", required: true, placeholder: "property_website", help: "Choose the matching property ID from the client Development record so both data sources merge." },
      { id: "serviceAccountJson", label: "Service account JSON", kind: "password", secret: true, required: true, placeholder: "Paste the complete JSON key", help: "Add the service account email as a Search Console user, then paste its JSON key. AquaCRM encrypts it before storage." },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    category: "Intelligence",
    description: "Power the private in-app business assistant with a model API key.",
    setupUrl: "https://platform.openai.com/api-keys",
    setupLabel: "Create an OpenAI API key",
    outcome: "The assistant can answer from the selected workspace data. ChatGPT subscriptions do not include API usage.",
    fields: [
      { id: "apiKey", label: "API key", kind: "password", secret: true, required: true, placeholder: "sk-...", help: "Create a project API key in the OpenAI Platform and paste it here." },
      { id: "model", label: "Model", kind: "text", required: true, placeholder: "gpt-5-mini", help: "The model used by the private AquaCRM assistant." },
    ],
  },
];

export function integrationDefinition(provider: IntegrationProvider): IntegrationDefinition {
  const definition = INTEGRATION_CATALOG.find(item => item.id === provider);
  if (!definition) throw new Error("Unsupported integration provider.");
  return definition;
}
