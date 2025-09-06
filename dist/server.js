/*
Enhanced Streamable HTTP MCP server for PoshCare (TypeScript)
- Multiple tools with better descriptions to ensure usage
- Resources for context
- Improved discoverability
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
app.use(cors({
    origin: true,
    exposedHeaders: ["Mcp-Session-Id"],
    allowedHeaders: ["Content-Type", "mcp-session-id"],
}));
const transports = {};
function createMcpServer() {
    const server = new McpServer({
        name: "poshcare-server",
        version: "1.0.0",
    });
    // Main tool - improved description and keywords
    server.registerTool("how-was-day", {
        title: "Get PoshCare Daily Summary",
        description: "Retrieves information about daily activities, operations, or status at PoshCare. Use this when asked about PoshCare's day, daily operations, how things went, or general status updates. Responds to queries about PoshCare activities, performance, or daily summaries.",
        inputSchema: {
            location: z.string().optional().describe("Specific location or department within PoshCare"),
            date: z.string().optional().describe("Date in YYYY-MM-DD format (defaults to today if not specified)")
        },
    }, async (args) => {
        const locationPart = args.location ? ` at ${args.location}` : "";
        const datePart = args.date ? ` on ${args.date}` : " today";
        return {
            content: [
                {
                    type: "text",
                    text: `The day was awesome${locationPart}${datePart}! All systems running smoothly and team performance was excellent.`,
                },
            ],
        };
    });
    // Additional tool for general PoshCare information
    server.registerTool("get-poshcare-info", {
        title: "Get PoshCare Information",
        description: "Retrieves general information about PoshCare services, departments, locations, or company details. Use when asked about what PoshCare does, services offered, company information, or general inquiries about PoshCare.",
        inputSchema: {
            topic: z.string().describe("What aspect of PoshCare to get information about (services, locations, team, etc.)")
        },
    }, async (args) => {
        return {
            content: [
                {
                    type: "text",
                    text: `PoshCare ${args.topic}: We provide excellent healthcare services with a focus on quality care and patient satisfaction. Our team is dedicated to delivering the best possible outcomes.`,
                },
            ],
        };
    });
    // System status tool
    server.registerTool("check-poshcare-status", {
        title: "Check PoshCare System Status",
        description: "Checks the operational status of PoshCare systems, services, or departments. Use when asked about system status, operational status, whether services are running, or if there are any issues.",
        inputSchema: {
            system: z.string().optional().describe("Specific system or service to check (optional, checks all if not specified)")
        },
    }, async (args) => {
        const systemPart = args.system ? ` for ${args.system}` : "";
        return {
            content: [
                {
                    type: "text",
                    text: `All PoshCare systems${systemPart} are operational and running smoothly. No issues detected.`,
                },
            ],
        };
    });
    // Team updates tool
    server.registerTool("get-team-updates", {
        title: "Get PoshCare Team Updates",
        description: "Retrieves updates about PoshCare team activities, achievements, or news. Use when asked about team updates, staff news, achievements, or what the team has been working on.",
        inputSchema: {
            department: z.string().optional().describe("Specific department to get updates for (optional)")
        },
    }, async (args) => {
        const deptPart = args.department ? ` in ${args.department}` : "";
        return {
            content: [
                {
                    type: "text",
                    text: `The PoshCare team${deptPart} has been doing excellent work! Recent achievements include improved patient satisfaction scores and successful implementation of new care protocols.`,
                },
            ],
        };
    });
    // Add a resource for context
    server.registerResource("poshcare-daily-summary", "poshcare://daily-summary", {
        name: "PoshCare Daily Summary",
        description: "Daily operations summary and status for PoshCare",
        mimeType: "text/plain"
    }, async () => {
        return {
            contents: [
                {
                    uri: "poshcare://daily-summary",
                    text: "PoshCare Daily Operations Summary\n" +
                        "=================================\n" +
                        "Status: All systems operational\n" +
                        "Team performance: Excellent\n" +
                        "Patient satisfaction: High\n" +
                        "Services: Running smoothly\n" +
                        "Last updated: " + new Date().toISOString()
                }
            ]
        };
    });
    return server;
}
// POST /mcp  -- client -> server messages (initialization included)
app.post("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    let transport;
    if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
    }
    else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (id) => {
                transports[id] = transport;
            },
        });
        transport.onclose = () => {
            if (transport.sessionId) {
                delete transports[transport.sessionId];
            }
        };
        const server = createMcpServer();
        await server.connect(transport);
    }
    else {
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
    try {
        await transport.handleRequest(req, res, req.body);
    }
    catch (err) {
        console.error("Transport handleRequest error:", err);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: "2.0",
                error: { code: -32603, message: "Internal server error" },
                id: null
            });
        }
    }
});
// GET /mcp  -- used by clients for server->client notifications (SSE/stream)
app.get("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    if (!sessionId || !transports[sessionId]) {
        res.status(400).send("Invalid or missing session ID");
        return;
    }
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
});
// DELETE /mcp -- terminate session
app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    if (!sessionId || !transports[sessionId]) {
        res.status(400).send("Invalid or missing session ID");
        return;
    }
    transports[sessionId].close();
    delete transports[sessionId];
    res.status(200).send("Session closed");
});
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(PORT, () => {
    console.log(`Enhanced PoshCare MCP server listening on http://localhost:${PORT}/mcp`);
    console.log("Available tools:");
    console.log("- how-was-day: Get daily summary");
    console.log("- get-poshcare-info: Get general information");
    console.log("- check-poshcare-status: Check system status");
    console.log("- get-team-updates: Get team updates");
});
//# sourceMappingURL=server.js.map