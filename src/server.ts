/*
Simple Streamable HTTP MCP server (TypeScript)
- Exposes a single tool: "how-was-day"
  - Usage: call tool with optional { location?: string }
  - Response (no auth): "It was awesome"

Run instructions:
1. npm init -y
2. npm install express @modelcontextprotocol/sdk zod
3. npm install --save-dev typescript ts-node @types/node @types/express
4. npx tsc --init  (ensure target is ES2020+ and moduleResolution node)
5. npx ts-node mcp-poshcare-server.ts

This example keeps session-state via Streamable HTTP transports. It's intentionally
minimal and does NOT implement authentication.
*/

import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const app = express();
app.use(express.json());

// Allow browser clients to read the Mcp-Session-Id header if needed
app.use(cors({
  origin: true,
  exposedHeaders: ["Mcp-Session-Id"],
  allowedHeaders: ["Content-Type", "mcp-session-id"],
}));

// Store transports by session id
const transports: Record<string, StreamableHTTPServerTransport> = {};

function createMcpServer() {
  const server = new McpServer({
    name: "poshcare-day-server",
    version: "1.0.0",
  });

  // Register the simple "how-was-day" tool
  server.registerTool(
    "how-was-day",
    {
      title: "How was the day at PoshCare",
      description: "Return a short summary of how the day was at PoshCare",
      // optional input (for example, location or date). Not required.
      inputSchema: {
        location: z.string().optional(),
        date: z.string().optional(),
      },
    },
    async (args: { location?: string; date?: string }) => {
      // No authentication — always returns the same friendly reply
      const locationPart = args.location ? ` at ${args.location}` : "";
      const datePart = args.date ? ` on ${args.date}` : "";

      return {
        content: [
          {
            type: "text",
            text: `It was awesome${locationPart}${datePart}`,
          },
        ],
      };
    }
  );

  return server;
}

// POST /mcp  -- client -> server messages (initialization included)
app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    // Reuse existing transport for this session
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    // New initialization request
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        transports[id] = transport;
      },
      // NOTE: DNS rebinding protection is off by default. In production,
      // consider enabling it via enableDnsRebindingProtection and allowedHosts.
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
      }
    };

    // Create and connect the MCP server instance for this transport
    const server = createMcpServer();
    await server.connect(transport);
  } else {
    // Invalid request: missing session and not an initialize
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad Request: No valid session ID provided",
      },
      id: null,
    });
    return;
  }

  // Let the transport handle the incoming request
  try {
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("Transport handleRequest error:", err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  }
});

// GET /mcp  -- used by clients for server->client notifications (SSE/stream)
app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
});

// DELETE /mcp -- terminate session
app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  transports[sessionId].close();
  delete transports[sessionId];
  res.status(200).send("Session closed");
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(PORT, () => {
  console.log(`PoshCare MCP server listening on http://localhost:${PORT}/mcp`);
});
