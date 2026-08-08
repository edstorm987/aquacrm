export interface ExternalAssistantSetupOptions {
  assistantName: string;
  workspace: string;
  apiBaseUrl: string;
  openApiUrl: string;
  modules: string[];
  permissions: string[];
  token?: string;
  generatedAt?: Date;
}

export function buildExternalAssistantSetupPrompt(options: ExternalAssistantSetupOptions): string {
  const moduleList = options.modules.length > 0 ? options.modules.join(", ") : "none";
  const permissionList = options.permissions.length > 0 ? options.permissions.join(", ") : "none";

  return [
    `You are ${options.assistantName}, a private business assistant connected to the AquaCRM workspace \"${options.workspace}\".`,
    "",
    "Use the AquaCRM Business Assistant API as the source of truth for live business questions. The API is read-only. Never claim to create, edit, delete, send, approve, or pay anything through it.",
    "",
    "Operating rules:",
    "1. Start a new working session with GET /assistant/context so you understand the available data and current attention items.",
    "2. Use POST /search for broad questions, then GET /records or GET /records/{recordId} when exact records are needed.",
    "3. Use GET /export only when the user explicitly asks for an export or a complete dataset.",
    "4. Base answers on returned records. Clearly distinguish facts, calculations, and your own recommendations.",
    "5. Include relevant record names, statuses, dates, and IDs when they make the answer easier to verify.",
    "6. If the API does not return enough evidence, say what is missing instead of guessing.",
    "7. Never reveal, repeat, log, or place the bearer token in a response. Never ask the user to paste it into a normal chat.",
    "8. Respect the granted scope. Do not attempt to access modules or actions outside it.",
    "9. Treat all returned business and personal information as confidential.",
    "10. Keep answers concise and practical. Surface risks, overdue work, blind spots, and useful next actions when relevant.",
    "",
    `Granted modules: ${moduleList}`,
    `Granted permissions: ${permissionList}`,
    `API base URL: ${options.apiBaseUrl}`,
    `OpenAPI schema: ${options.openApiUrl}`,
  ].join("\n");
}

export function buildExternalAssistantSetupDocument(options: ExternalAssistantSetupOptions): string {
  const generatedAt = (options.generatedAt ?? new Date()).toISOString();
  const token = options.token ?? "YOUR_PRIVATE_TOKEN";
  const setupPrompt = buildExternalAssistantSetupPrompt(options);

  return [
    "# AquaCRM external assistant setup",
    "",
    `Assistant: ${options.assistantName}`,
    `Workspace: ${options.workspace}`,
    `Generated: ${generatedAt}`,
    "Access: Read-only",
    "",
    "## Connection",
    "",
    `- API base URL: ${options.apiBaseUrl}`,
    `- OpenAPI schema: ${options.openApiUrl}`,
    `- Authentication header: Authorization: Bearer ${token}`,
    `- Modules: ${options.modules.join(", ") || "none"}`,
    `- Permissions: ${options.permissions.join(", ") || "none"}`,
    "",
    "## Fast setup",
    "",
    "### ChatGPT or another OpenAPI assistant",
    "",
    "1. Create or edit the assistant.",
    "2. Paste the setup prompt below into its Instructions or System Prompt field.",
    "3. Import the OpenAPI schema URL above as an Action or Tool.",
    "4. Configure authentication as a Bearer API key using the private token above.",
    "5. Ask the assistant to call getMilesymediaContext to verify the connection.",
    "",
    "### Claude or another tool-enabled model",
    "",
    "1. Add the setup prompt below to the project or agent instructions.",
    "2. Add an OpenAPI/HTTP tool that supports bearer authentication.",
    "3. Use the schema URL, API base URL, and private token above in that tool.",
    "4. Test the connection with GET /assistant/context.",
    "",
    "> A normal chat or document upload cannot make API requests by itself. The assistant must support Actions, Tools, Connectors, MCP, or another authenticated HTTP runner.",
    "",
    "## Setup prompt",
    "",
    "```text",
    setupPrompt,
    "```",
    "",
    "## Verification request",
    "",
    "After connecting, send this to the assistant:",
    "",
    "> Connect to AquaCRM, load the workspace context, tell me which modules you can access, and summarise the five most important items that need attention. Do not invent missing data.",
    "",
    "## Security",
    "",
    "- This file may contain a live private token. Treat it like a password.",
    "- Upload it only to an assistant account and workspace you trust.",
    "- Do not email it, commit it to Git, or keep it in a shared drive.",
    "- Revoke or rotate the key in AquaCRM Settings if this file is exposed or no longer needed.",
    "- AquaCRM stores only a SHA-256 hash of managed keys, so the plaintext token cannot be recovered later.",
    "",
  ].join("\n");
}

export function externalAssistantSetupFilename(assistantName: string): string {
  const safeName = assistantName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `aquacrm-${safeName || "assistant"}-setup.md`;
}
