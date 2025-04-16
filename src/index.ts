import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express, { Request, Response } from "express";
import path from "path";
import { z } from "zod";

const PROJECT_ROOT = process.cwd();

const server = new McpServer({
  name: "SBB Transport",
  version: "1.0.0",
  capabilities: {
    logging: {},
  },
});

// Register logging capability with the underlying server
server.server.registerCapabilities({
  logging: {},
});

server.resource(
  "echo",
  new ResourceTemplate("echo://{message}", { list: undefined }),
  async (uri, { message }) => ({
    contents: [
      {
        uri: uri.href,
        text: `Resource echo: ${message}`,
      },
    ],
  })
);

// Find connection tool
server.tool(
  "find-connection",
  {
    from: z.string().describe("Departure location"),
    to: z.string().describe("Arrival location"),
    date: z.string().optional().describe("Date in format YYYY-MM-DD"),
    time: z.string().optional().describe("Time in format HH:mm"),
    isArrivalTime: z
      .boolean()
      .optional()
      .describe(
        "If true, the specified time is treated as arrival time. Default is false (departure time)"
      ),
  },
  async ({ from, to, date, time, isArrivalTime }) => {
    try {
      const baseUrl = "http://transport.opendata.ch/v1/connections";
      const params = new URLSearchParams({
        from,
        to,
        ...(date && { date }),
        ...(time && { time }),
        ...(isArrivalTime && { isArrivalTime: "1" }),
        limit: "3", // Return 3 connections by default
      });

      const response = await fetch(`${baseUrl}?${params}`);
      const data = await response.json();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      return {
        content: [
          {
            type: "text",
            text: `Error finding connections: ${errorMessage}`,
          },
        ],
      };
    }
  }
);

server.prompt("echo", { message: z.string() }, ({ message }) => ({
  messages: [
    {
      role: "user",
      content: {
        type: "text",
        text: `Please process this message: ${message}`,
      },
    },
  ],
}));

// STDIO
// async function main() {
//   const transport = new StdioServerTransport();
//   await server.connect(transport);
// }

// main();

// SSE
const app = express();

// Serve static files from the public directory
app.use(express.static(path.join(PROJECT_ROOT, "public")));

// to support multiple simultaneous connections we have a lookup object from
// sessionId to transport
const transports: { [sessionId: string]: SSEServerTransport } = {};

app.get("/sse", async (_: Request, res: Response) => {
  const transport = new SSEServerTransport("/messages", res);
  transports[transport.sessionId] = transport;
  res.on("close", () => {
    delete transports[transport.sessionId];
  });
  await server.connect(transport);
});

app.get("/test", async (_: Request, res: Response) => {
  res.send("Test route works!");
});

app.get("/", async (_: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/messages", async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports[sessionId];
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("No transport found for sessionId");
  }
});

app.listen(3001, "0.0.0.0");
