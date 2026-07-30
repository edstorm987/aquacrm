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
        "Read-only, tenant-scoped access to live Milesymedia business data.",
        "Use this API from a Custom GPT Action, an AI skill, or any authenticated assistant.",
        "The API never exposes passwords, tokens, credentials, or stored file bodies.",
      ].join(" "),
    },
    servers: [{ url: `${origin}/api/v1`, description: "Current Milesymedia deployment" }],
    security: [{ bearerAuth: [] }],
    paths: {
      "/assistant/context": {
        get: {
          operationId: "getMilesymediaContext",
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
      "/records": {
        get: {
          operationId: "listMilesymediaRecords",
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
          operationId: "getMilesymediaRecord",
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
          operationId: "searchMilesymedia",
          summary: "Search live Milesymedia data",
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
          operationId: "exportMilesymediaData",
          summary: "Export current Milesymedia data",
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
          bearerFormat: "Milesymedia API token",
          description: "Use the private MILESYMEDIA_ASSISTANT_API_TOKEN value.",
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
