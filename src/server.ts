import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types";

// Main entry
async function main() {
  const server = new Server(
    { name: "kleenito-mcp-server", version: "1.0.0" },
    { capabilities: { tools: { listChanged: true } } }
  );

  // List tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "getLastMonthSale",
        description: "Get Kleenito last month sale",
        inputSchema: {
          type: "object",
          properties: {
            month: {
              type: "string",
              description: "Month to get sales for",
            },
          },
          required: ["month"],
        },
      },
    ],
  }));

  // Handle tool execution
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name === "getLastMonthSale") {
      const { month } = req.params.arguments as { month: string };
      return {
        content: [{ type: "text", text: `Sales for ${month}: 500` }],
      };
    }
    throw new Error(`Unknown tool: ${req.params.name}`);
  });

  // Express app
  const app = express();
  app.use(express.json());

  // MCP endpoint
  app.post("/mcp", async (req, res) => {
    try {
      const response = await server.request(req.body);
      res.json(response);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const port = process.env.PORT || 3001;
  app.listen(port, () => {
    console.log(`🚀 Kleenito MCP server running at http://localhost:${port}/mcp`);
  });
}

main();
