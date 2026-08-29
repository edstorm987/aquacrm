export type IntegrationProvider = "resend" | "smtp" | "twilio" | "meta" | "stripe" | "github" | "vercel" | "openai" | "aqua-editor-ai" | "google-search-console" | "client-supabase";

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
  category: "Communication" | "Payments" | "Development" | "Intelligence" | "Client data";
  description: string;
  setupUrl: string;
  setupLabel: string;
  outcome: string;
  fields: IntegrationFieldDefinition[];
}

export const INTEGRATION_CATALOG: IntegrationDefinition[] = [
  {
    // A CLIENT's own Supabase project — their database, not ours.
    //
    // Ed, 2026-08-27: *"surely we have to link their superbase inside this to
    // get their forms data and then internally we just get a notification to
    // say they got the form so we can track enquiries without merging or
    // breaching data."*
    //
    // ── Why there is no service-role key field here ──────────────────────
    //
    // A Supabase service-role key bypasses row-level security entirely: it is
    // root on that project. Storing one per client would mean a single
    // compromise of this vault hands over every client's whole database, and
    // no amount of encryption at rest changes what the key itself grants.
    //
    // The anon key is powerless on its own — it can only do what that
    // project's RLS policies allow — so the client stays in control of exactly
    // which table we may read, and can revoke it without touching anything
    // else. If somebody later "just needs" the service key for a feature, that
    // is the moment to design the feature differently, not to add the field.
    //
    // ── Why a webhook secret rather than polling ─────────────────────────
    //
    // The notification comes from THEM: a Supabase Database Webhook fires on
    // insert and posts a minimal payload — which client, which form, which row,
    // when. No personal data crosses the boundary to tell us an enquiry landed.
    // Polling would mean holding a live connection open on a timer and reading
    // their data to discover something they could simply have told us.
    id: "client-supabase",
    name: "Client Supabase",
    category: "Client data",
    description: "Read a client's own form submissions from their Supabase project, without copying the data into AquaCRM.",
    setupUrl: "https://supabase.com/dashboard/project/_/settings/api",
    setupLabel: "Open Supabase API settings",
    outcome: "Enquiries land in this client's portal, and the agency inbox shows that one arrived without holding the customer's details.",
    fields: [
      { id: "projectUrl", label: "Project URL", kind: "url", required: true, placeholder: "https://xxxxxxxx.supabase.co", help: "Settings → API → Project URL in the client's Supabase dashboard." },
      { id: "anonKey", label: "Anon (public) key", kind: "password", secret: true, required: true, placeholder: "eyJ...", help: "The anon key ONLY. Never the service-role key — that one bypasses row-level security and would give AquaCRM full access to their database." },
      { id: "submissionsTable", label: "Submissions table", kind: "text", required: true, placeholder: "form_submissions", help: "The table their website form writes into. It needs a row-level-security policy allowing this key to read it." },
      { id: "webhookSecret", label: "Webhook secret", kind: "password", secret: true, placeholder: "A long random string", help: "Paste the same value into the client's Supabase Database Webhook header so AquaCRM can verify the notification really came from them." },
      // Column overrides — all optional, because the common case needs none.
      // `clientFormMapping` recognises the ordinary names (email, full_name,
      // phone, message, created_at) on its own; these exist for the table that
      // calls its message column `enquiry_body_v2`. Config, not secrets: a
      // column name is not sensitive and hiding it behind a write-only field
      // would make it impossible to check what the mapping is doing.
      { id: "columnName", label: "Name column", kind: "text", placeholder: "Detected automatically", help: "Only needed if the column is not called something obvious like name or full_name." },
      { id: "columnEmail", label: "Email column", kind: "text", placeholder: "Detected automatically", help: "Only needed if the column is not called something obvious like email." },
      { id: "columnPhone", label: "Phone column", kind: "text", placeholder: "Detected automatically", help: "Only needed if the column is not called something obvious like phone or mobile." },
      { id: "columnMessage", label: "Message column", kind: "text", placeholder: "Detected automatically", help: "Only needed if the column is not called something obvious like message or enquiry." },
      { id: "columnSubmittedAt", label: "Submitted-at column", kind: "text", placeholder: "Detected automatically", help: "Only needed if the column is not called something obvious like created_at." },
      // Blank means no confirmation is sent. Enabling it by WRITING THE SUBJECT
      // means the feature cannot be switched on without deciding what the
      // customer will actually receive — a checkbox would let somebody enable
      // it and ship a default nobody read.
      { id: "confirmationSubject", label: "Confirmation subject", kind: "text", placeholder: "Leave blank to send nothing", help: "Fill this in to send the customer an automatic thank-you from this client's own email connection. Blank means no confirmation is sent." },
      { id: "confirmationBody", label: "Confirmation message", kind: "text", placeholder: "Thanks — we have your message and will be in touch.", help: "The body of that thank-you. Their name is added automatically when the form captured one." },
    ],
  },
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
    id: "meta",
    name: "Meta messaging",
    category: "Communication",
    description: "Connect Instagram and Facebook messaging so social conversations arrive in Master Inbox.",
    setupUrl: "https://developers.facebook.com/apps",
    setupLabel: "Open Meta for Developers",
    outcome: "AquaCRM stores your Meta app credentials encrypted. Connect each Instagram or Facebook account from the social inbox using Meta's consent screen.",
    fields: [
      { id: "appId", label: "App ID", kind: "text", required: true, placeholder: "1234567890123456", help: "From your Meta app dashboard under App settings → Basic." },
      { id: "appSecret", label: "App Secret", kind: "password", secret: true, required: true, placeholder: "Meta app secret", help: "App settings → Basic → App Secret. AquaCRM encrypts it and never shows it again." },
      { id: "webhookVerifyToken", label: "Webhook verify token", kind: "password", secret: true, required: true, placeholder: "A strong token you choose", help: "Invent any strong string, then paste the same value into your Meta app's Messenger/Instagram webhook “Verify token” field." },
      { id: "graphApiVersion", label: "Graph API version", kind: "text", required: true, placeholder: "v21.0", help: "The Meta Graph API version your app targets, for example v21.0." },
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
  {
    // ─── AQUA EDITOR AI ────────────────────────────────────────────────────
    //
    // Deliberately a SEPARATE provider kind from `openai`, not a second
    // `openai` connection. Ed's call: "aqua editor ai needs to be its only
    // thing… needs a seperate tocken please to configure."
    //
    // Two things follow from the separation, and both are the point:
    //   • `resolveIntegrationValues(agencyId, "openai")` — how the Aqua
    //     Advisor and the Dev Team Librarian find their key — can never
    //     return this one, and this one can never return theirs. Spending the
    //     agency's assistant budget from the editor, or vice versa, stops
    //     being possible rather than being a convention;
    //   • a connection of this kind is bound to ONE dev project by id
    //     (`EditorAiConfig.connectionId`), so "saved per project" is a real
    //     scope and not a label.
    //
    // A workspace-scoped connection of this kind resolves nothing — the
    // editor only ever resolves the connection its project names. Ed adds the
    // key from the project's own screen; this card exists so it is visible
    // and revocable beside every other credential.
    id: "aqua-editor-ai",
    name: "Aqua Editor AI",
    category: "Intelligence",
    description: "The editor's own assistant, with its own key and its own model, configured per dev project.",
    setupUrl: "https://platform.openai.com/api-keys",
    setupLabel: "Create an API key",
    outcome: "Aqua Editor AI answers inside the editor for ONE project, on this key. It is never used by the Aqua Advisor, and the Advisor's key is never used by it.",
    fields: [
      { id: "apiKey", label: "API key", kind: "password", secret: true, required: true, placeholder: "sk-...", help: "This project's own key. AquaCRM encrypts it in the vault and never shows it again." },
      { id: "model", label: "Model", kind: "text", required: true, placeholder: "gpt-5-mini", help: "The model Aqua Editor AI runs on for this project." },
    ],
  },
];

export function integrationDefinition(provider: IntegrationProvider): IntegrationDefinition {
  const definition = INTEGRATION_CATALOG.find(item => item.id === provider);
  if (!definition) throw new Error("Unsupported integration provider.");
  return definition;
}

/** Providers whose real consumers carry an agency + target-client boundary. */
const CLIENT_SCOPED_PROVIDERS = new Set<IntegrationProvider>([
  // Client Supabase is client-scoped BY DEFINITION — an agency-wide one would
  // be meaningless, since the whole point is that each client's data stays in
  // their own project.
  "client-supabase",
  "resend",
  "smtp",
  "twilio",
  "stripe",
  "github",
  "vercel",
  "openai",
  "google-search-console",
]);

export function integrationSupportsClientScope(provider: IntegrationProvider): boolean {
  return CLIENT_SCOPED_PROVIDERS.has(provider);
}
