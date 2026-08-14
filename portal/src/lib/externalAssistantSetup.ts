export interface ExternalAssistantSetupOptions {
  assistantName: string;
  workspace: string;
  apiBaseUrl: string;
  openApiUrl: string;
  mcpUrl?: string;
  modules: string[];
  permissions: string[];
  token?: string;
  generatedAt?: Date;
}

export function buildExternalAssistantSetupPrompt(options: ExternalAssistantSetupOptions): string {
  const moduleList = options.modules.length > 0 ? options.modules.join(", ") : "none";
  const permissionList = options.permissions.length > 0 ? options.permissions.join(", ") : "none";
  const mcpUrl = resolvedMcpUrl(options);

  return [
    `You are ${options.assistantName}, a private business assistant connected to the AquaCRM workspace \"${options.workspace}\".`,
    "",
    "Use the AquaCRM Business Assistant MCP server or REST API as the source of truth for live business questions. Business data is read-only. If actions:propose was granted, you may submit evidence-backed proposals to the human approval inbox, but you still cannot create, edit, complete, delete, send, approve, or pay anything directly.",
    "",
    "Operating rules:",
    "1. Start a new working session with the aqua_advisor_context MCP tool when available, or GET /advisor/context over REST, so you understand business health, Radar findings, recommended actions, and current attention items.",
    "2. If Advisor peer access was not granted, start with GET /assistant/context. Use POST /search for broad questions, then GET /records or GET /records/{recordId} when exact records are needed.",
    "3. Use GET /export only when the user explicitly asks for an export or a complete dataset.",
    "4. Base answers on returned records. Clearly distinguish facts, calculations, and your own recommendations.",
    "5. Include relevant record names, statuses, dates, and IDs when they make the answer easier to verify.",
    "6. If the API does not return enough evidence, say what is missing instead of guessing.",
    "7. Never reveal, repeat, log, or place the bearer token in a response. Never ask the user to paste it into a normal chat.",
    "8. Respect the granted scope. Do not attempt to access modules or actions outside it.",
    "9. Treat all returned business and personal information as confidential.",
    "10. Keep answers concise and practical. Surface risks, overdue work, blind spots, and useful next actions when relevant.",
    "11. When actions:propose is granted, use aqua_propose_action or POST /actions/proposals only for a specific, evidence-backed action with an expected outcome and exact source IDs. Submission creates a proposal, never a task.",
    "12. Use aqua_list_action_proposals or GET /actions/proposals to learn whether your previous proposals were accepted, parked, or rejected.",
    "",
    `Granted modules: ${moduleList}`,
    `Granted permissions: ${permissionList}`,
    `API base URL: ${options.apiBaseUrl}`,
    `OpenAPI schema: ${options.openApiUrl}`,
    `MCP server: ${mcpUrl}`,
  ].join("\n");
}

export function buildExternalAssistantSetupDocument(options: ExternalAssistantSetupOptions): string {
  const generatedAt = (options.generatedAt ?? new Date()).toISOString();
  const token = options.token ?? "YOUR_PRIVATE_TOKEN";
  const setupPrompt = buildExternalAssistantSetupPrompt(options);
  const mcpUrl = resolvedMcpUrl(options);

  return [
    "# AquaCRM external assistant setup",
    "",
    `Assistant: ${options.assistantName}`,
    `Workspace: ${options.workspace}`,
    `Generated: ${generatedAt}`,
    `Access: Read-only business data${options.permissions.includes("actions:propose") ? "; proposal inbox submission enabled" : ""}`,
    "",
    "## Connection",
    "",
    `- API base URL: ${options.apiBaseUrl}`,
    `- OpenAPI schema: ${options.openApiUrl}`,
    `- MCP server URL: ${mcpUrl}`,
    `- Authentication header: Authorization: Bearer ${token}`,
    `- Modules: ${options.modules.join(", ") || "none"}`,
    `- Permissions: ${options.permissions.join(", ") || "none"}`,
    "",
    "## Fast setup",
    "",
    "### MCP-compatible assistant",
    "",
    "1. Add a remote Streamable HTTP MCP server using the MCP server URL above.",
    "2. Configure the Authorization header as Bearer authentication using the private token above.",
    "3. Connect and confirm that aqua_advisor_context appears when Advisor peer access was granted.",
    "4. Call aqua_advisor_context, then use the scoped record and search tools for supporting evidence.",
    "5. If actions:propose was granted, confirm aqua_propose_action and aqua_list_action_proposals are available. Submitted proposals still require human approval.",
    "",
    "### ChatGPT or another OpenAPI assistant",
    "",
    "1. Create or edit the assistant.",
    "2. Paste the setup prompt below into its Instructions or System Prompt field.",
    "3. Import the OpenAPI schema URL above as an Action or Tool.",
    "4. Configure authentication as a Bearer API key using the private token above.",
    "5. Ask the assistant to call getAquaCrmAdvisorContext to verify its Advisor peer connection.",
    "6. If proposal access was granted, verify proposeAquaCrmAction is available without submitting a test proposal.",
    "",
    "### Claude or another tool-enabled model",
    "",
    "1. Add the setup prompt below to the project or agent instructions.",
    "2. Add an OpenAPI/HTTP tool that supports bearer authentication.",
    "3. Use the schema URL, API base URL, and private token above in that tool.",
    "4. Test the connection with GET /advisor/context.",
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

function resolvedMcpUrl(options: ExternalAssistantSetupOptions): string {
  if (options.mcpUrl) return options.mcpUrl;
  return `${options.apiBaseUrl.replace(/\/api\/v1\/?$/, "")}/api/mcp`;
}
