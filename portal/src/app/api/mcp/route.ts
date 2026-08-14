import {
  authenticateExternalAssistant,
  ExternalAssistantApiError,
  externalApiErrorResponse,
  externalApiHeaders,
} from "@/lib/server/externalAssistantApi";
import { handleExternalAssistantMcpRequest } from "@/lib/server/externalAssistantMcp";
import { ensureHydrated } from "@/server/storage";

export async function POST(request: Request) {
  try {
    validateOrigin(request);
    await ensureHydrated({ fresh: true });
    const auth = await authenticateExternalAssistant(request);
    const body = await request.json().catch(() => null);
    if (body === null) {
      return mcpJson({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error." } }, 400);
    }
    const response = await handleExternalAssistantMcpRequest(auth, body);
    if (response === null) return new Response(null, { status: 202, headers: mcpHeaders() });
    return mcpJson(response);
  } catch (error) {
    return externalApiErrorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    validateOrigin(request);
    await ensureHydrated({ fresh: true });
    await authenticateExternalAssistant(request);
    const headers = mcpHeaders();
    headers.set("allow", "POST, GET, DELETE");
    return Response.json({
      ok: false,
      error: { code: "stream_not_supported", message: "This stateless MCP server accepts JSON-RPC messages over POST and does not open an SSE stream." },
    }, { status: 405, headers });
  } catch (error) {
    return externalApiErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    validateOrigin(request);
    await ensureHydrated({ fresh: true });
    await authenticateExternalAssistant(request);
    return new Response(null, { status: 204, headers: mcpHeaders() });
  } catch (error) {
    return externalApiErrorResponse(error);
  }
}

function validateOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin === new URL(request.url).origin) return;
  throw new ExternalAssistantApiError(403, "origin_rejected", "The MCP request origin is not allowed.");
}

function mcpHeaders() {
  const headers = externalApiHeaders();
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("mcp-protocol-version", "2025-11-25");
  return headers;
}

function mcpJson(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: mcpHeaders() });
}
