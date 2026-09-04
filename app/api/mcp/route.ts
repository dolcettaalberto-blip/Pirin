import { NextRequest, NextResponse } from "next/server";
import { TOOLS, callTool } from "@/lib/mcp-tools";

export const dynamic = "force-dynamic";

const SERVER_INFO = { name: "pirin-tracker", title: "Pirin Tracker", version: "1.0.0" };
const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const DEFAULT_PROTOCOL = "2025-06-18";

type JsonRpcId = string | number | null;
type JsonRpcRequest = { jsonrpc: "2.0"; id?: JsonRpcId; method: string; params?: Record<string, unknown> };

function result(id: JsonRpcId, value: unknown) {
  return { jsonrpc: "2.0" as const, id, result: value };
}
function error(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}

/**
 * The MCP endpoint is a personal data connector, so it is gated by a shared
 * secret. Accepts either an Authorization: Bearer header (Claude Code, most
 * MCP clients) or ?key= (clients that only take a URL).
 */
function authorized(request: NextRequest): boolean {
  const expected = process.env.MCP_TOKEN;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  const provided = bearer ?? request.nextUrl.searchParams.get("key");
  if (!provided || provided.length !== expected.length) return false;
  // constant-time-ish compare
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}

async function handle(req: JsonRpcRequest) {
  const id = req.id ?? null;
  switch (req.method) {
    case "initialize": {
      const asked = String((req.params as { protocolVersion?: string } | undefined)?.protocolVersion ?? "");
      return result(id, {
        protocolVersion: SUPPORTED_PROTOCOLS.includes(asked) ? asked : DEFAULT_PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          "Training data and plan control for Pirin Extreme. Read intervals.icu wellness and activities " +
          "directly, get a ready-made progress digest, and push plan changes back to the Pirin Tracker repo " +
          "with update_plan (validated, one commit, auto-deploys).",
      });
    }
    case "ping":
      return result(id, {});
    case "tools/list":
      return result(id, { tools: TOOLS });
    case "resources/list":
      return result(id, { resources: [] });
    case "prompts/list":
      return result(id, { prompts: [] });
    case "tools/call": {
      const params = (req.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
      if (!params.name) return error(id, -32602, "tools/call requires a tool name");
      try {
        return result(id, await callTool(params.name, params.arguments ?? {}));
      } catch (e) {
        return result(id, {
          content: [{ type: "text", text: `Tool failed: ${e instanceof Error ? e.message : String(e)}` }],
          isError: true,
        });
      }
    }
    default:
      return error(id, -32601, `Method not found: ${req.method}`);
  }
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized: missing or bad MCP token" } },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(error(null, -32700, "Parse error"), { status: 400 });
  }

  const batch = Array.isArray(body) ? (body as JsonRpcRequest[]) : [body as JsonRpcRequest];
  const responses = [];
  for (const req of batch) {
    // Notifications carry no id and expect no response.
    if (req?.id === undefined) continue;
    responses.push(await handle(req));
  }

  if (responses.length === 0) return new NextResponse(null, { status: 202 });
  return NextResponse.json(Array.isArray(body) ? responses : responses[0], {
    headers: { "Cache-Control": "no-store" },
  });
}

/** No server-initiated SSE stream: this server is stateless request/response. */
export async function GET() {
  return new NextResponse("Method Not Allowed — this MCP server is POST-only (stateless JSON).", { status: 405 });
}
