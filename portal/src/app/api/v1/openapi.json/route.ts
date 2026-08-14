import { EXTERNAL_ASSISTANT_MODULES, externalApiHeaders } from "@/lib/server/externalAssistantApi";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const moduleSchema = {
    type: "string",
    enum: EXTERNAL_ASSISTANT_MODULES,
  };
  const errorResponses = {
    "400": { $ref: "#/components/responses/BadRequest" },
    "401": { $ref: "#/components/responses/Unauthorized" },
    "429": { $ref: "#/components/responses/RateLimited" },
    "500": { $ref: "#/components/responses/ServerError" },
  };

  const document = {
    openapi: "3.1.0",
    info: {
      title: "AquaCRM Business Assistant API",
      version: "1.0.0",
      description: [
        "Tenant-scoped access to live AquaCRM business data.",
        "Use this API from a Custom GPT Action, an AI skill, or any authenticated assistant.",
        "Business records are read-only. Assistants with actions:propose may write only to the human approval inbox; they cannot create or alter tasks directly.",
        "The API never exposes passwords, tokens, credentials, or stored file bodies.",
      ].join(" "),
    },
    servers: [{ url: `${origin}/api/v1`, description: "Current AquaCRM deployment" }],
    security: [{ bearerAuth: [] }],
    paths: {
      "/assistant/context": {
        get: {
          operationId: "getAquaCrmContext",
          summary: "Understand the current AquaCRM workspace",
          description: "Returns available modules, record counts, capabilities, and high-priority attention items.",
          responses: {
            "200": {
              description: "Workspace context",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ContextResponse" } } },
            },
            ...errorResponses,
          },
        },
      },
      "/advisor/context": {
        get: {
          operationId: "getAquaCrmAdvisorContext",
          summary: "Load Advisor-grade business context",
          description: "Returns module-scoped health, Radar findings, alerts, recommendations, and accepted tasks. This endpoint is read-only and recommendations still require human approval inside AquaCRM.",
          responses: {
            "200": {
              description: "Advisor peer context",
              content: { "application/json": { schema: { $ref: "#/components/schemas/AdvisorContextResponse" } } },
            },
            "403": { $ref: "#/components/responses/Forbidden" },
            ...errorResponses,
          },
        },
      },
      "/actions/proposals": {
        get: {
          operationId: "listAquaCrmActionProposals",
          summary: "List this assistant's action proposals",
          description: "Returns the decision state and linked task ID for proposals submitted by the authenticated assistant key.",
          responses: {
            "200": { description: "Proposal history", content: { "application/json": { schema: { $ref: "#/components/schemas/ProposalListResponse" } } } },
            "403": { $ref: "#/components/responses/Forbidden" },
            ...errorResponses,
          },
        },
        post: {
          operationId: "proposeAquaCrmAction",
          summary: "Submit an action for human approval",
          description: "Writes only to the proposal inbox. A person must accept the proposal before AquaCRM creates a task.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/ActionProposalInput" } } },
          },
          responses: {
            "202": { description: "Proposal queued without creating a task", content: { "application/json": { schema: { $ref: "#/components/schemas/ProposalResponse" } } } },
            "403": { $ref: "#/components/responses/Forbidden" },
            ...errorResponses,
          },
        },
      },
      "/records": {
        get: {
          operationId: "listAquaCrmRecords",
          summary: "List live records from one module",
          parameters: [
            { name: "module", in: "query", required: true, schema: moduleSchema },
            { name: "status", in: "query", required: false, schema: { type: "string" } },
            { name: "updatedAfter", in: "query", required: false, schema: { type: "string", format: "date-time" } },
            { name: "cursor", in: "query", required: false, schema: { type: "string" } },
            { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
          ],
          responses: {
            "200": {
              description: "Paginated records",
              content: { "application/json": { schema: { $ref: "#/components/schemas/RecordPage" } } },
            },
            ...errorResponses,
          },
        },
      },
      "/records/{recordId}": {
        get: {
          operationId: "getAquaCrmRecord",
          summary: "Get one live record",
          parameters: [
            { name: "recordId", in: "path", required: true, schema: { type: "string" } },
            { name: "module", in: "query", required: true, schema: moduleSchema },
          ],
          responses: {
            "200": {
              description: "Record",
              content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
            },
            "404": { $ref: "#/components/responses/NotFound" },
            ...errorResponses,
          },
        },
      },
      "/search": {
        post: {
          operationId: "searchAquaCrm",
          summary: "Search live AquaCRM data",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["query"],
                  properties: {
                    query: { type: "string", minLength: 2, maxLength: 200 },
                    modules: { type: "array", items: moduleSchema },
                    limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Ranked search results",
              content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
            },
            ...errorResponses,
          },
        },
      },
      "/export": {
        get: {
          operationId: "exportAquaCrmData",
          summary: "Export current AquaCRM data",
          description: "Exports one module or the full workspace as JSON or CSV.",
          parameters: [
            { name: "module", in: "query", required: false, schema: moduleSchema },
            { name: "format", in: "query", required: false, schema: { type: "string", enum: ["json", "csv"], default: "json" } },
          ],
          responses: {
            "200": {
              description: "Downloadable export",
              content: {
                "application/json": { schema: { type: "object", additionalProperties: true } },
                "text/csv": { schema: { type: "string" } },
              },
            },
            ...errorResponses,
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "AquaCRM assistant key",
          description: "Use the one-time private key created for this assistant in AquaCRM Settings.",
        },
      },
      schemas: {
        ApplicationRecord: {
          type: "object",
          required: ["id", "module", "title", "data"],
          properties: {
            id: { type: "string" },
            module: moduleSchema,
            title: { type: "string" },
            status: { type: "string" },
            createdAt: { type: "integer" },
            updatedAt: { type: "integer" },
            data: { type: "object", additionalProperties: true },
          },
        },
        RecordPage: {
          type: "object",
          required: ["ok", "module", "records", "total"],
          properties: {
            ok: { type: "boolean" },
            module: moduleSchema,
            records: { type: "array", items: { $ref: "#/components/schemas/ApplicationRecord" } },
            total: { type: "integer" },
            nextCursor: { type: ["string", "null"] },
            generatedAt: { type: "string", format: "date-time" },
          },
        },
        ContextResponse: {
          type: "object",
          required: ["ok", "context"],
          properties: {
            ok: { type: "boolean" },
            context: { type: "object", additionalProperties: true },
          },
        },
        AdvisorContextResponse: {
          type: "object",
          required: ["ok", "advisor"],
          properties: {
            ok: { type: "boolean" },
            advisor: { type: "object", additionalProperties: true },
          },
        },
        ActionProposalInput: {
          type: "object",
          required: ["title", "detail", "expectedOutcome"],
          additionalProperties: false,
          properties: {
            title: { type: "string", minLength: 2, maxLength: 240 },
            detail: { type: "string", minLength: 2, maxLength: 2000 },
            expectedOutcome: { type: "string", minLength: 2, maxLength: 600 },
            evidence: { type: "array", maxItems: 20, items: { type: "string", maxLength: 500 } },
            category: { type: "string", enum: ["company", "client", "sales", "finance", "delivery", "support", "development", "marketing", "operations"], default: "operations" },
            priority: { type: "string", enum: ["low", "normal", "high", "urgent"], default: "normal" },
            suggestedDueAt: { type: "string", format: "date-time" },
            sourceIds: { type: "array", maxItems: 30, items: { type: "string", maxLength: 240 } },
            sourceHref: { type: "string", pattern: "^/" },
          },
        },
        ActionProposal: {
          type: "object",
          required: ["id", "assistantName", "title", "detail", "status", "submittedAt"],
          properties: {
            id: { type: "string" },
            assistantName: { type: "string" },
            title: { type: "string" },
            detail: { type: "string" },
            status: { type: "string", enum: ["pending", "parked", "accepted", "rejected"] },
            submittedAt: { type: "integer" },
            taskId: { type: "string" },
          },
          additionalProperties: true,
        },
        ProposalResponse: {
          type: "object",
          required: ["ok", "proposal", "message"],
          properties: {
            ok: { type: "boolean" },
            proposal: { $ref: "#/components/schemas/ActionProposal" },
            message: { type: "string" },
          },
        },
        ProposalListResponse: {
          type: "object",
          required: ["ok", "proposals"],
          properties: {
            ok: { type: "boolean" },
            proposals: { type: "array", items: { $ref: "#/components/schemas/ActionProposal" } },
            generatedAt: { type: "string", format: "date-time" },
          },
        },
        Error: {
          type: "object",
          properties: {
            ok: { type: "boolean", const: false },
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
              },
            },
          },
        },
      },
      responses: {
        BadRequest: {
          description: "Invalid request",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        Unauthorized: {
          description: "Missing or invalid bearer token",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        Forbidden: {
          description: "The assistant key does not grant the required permission or module.",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        NotFound: {
          description: "Record not found",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        RateLimited: {
          description: "Too many requests",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        ServerError: {
          description: "Server error",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
      },
    },
  };

  const headers = externalApiHeaders();
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(document, null, 2), { headers });
}
