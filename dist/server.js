import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
const server = new Server({ name: "kleenito-mcp-server", version: "1.0.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "getLastMonthSale",
            description: "Returns last month's sales for Kleenito",
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
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "getLastMonthSale") {
        return {
            content: [
                {
                    type: "text",
                    text: "500",
                },
            ],
        };
    }
    throw new Error(`Unknown tool: ${request.params.name}`);
});
const app = express();
app.use(express.json());
app.post("/mcp", async (req, res) => {
    try {
        const response = await server.request(req.body);
        res.json(response);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.listen(3001, () => console.log("MCP server running on port 3001"));
