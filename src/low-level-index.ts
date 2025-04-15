import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  CompleteRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  Prompt,
  ReadResourceRequestSchema,
  Resource,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  {
    name: "mcp-starter",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
      prompts: {},
      logging: {},
    },
  }
);

// Echo Tool
const ECHO_TOOL: Tool = {
  name: "echo",
  description: "Echo tool that repeats the input message",
  inputSchema: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description: "The message to echo",
      },
    },
    required: ["message"],
  },
};

// Echo Resource
const ECHO_RESOURCE: Resource = {
  name: "echo",
  description: "Echo resource that returns the input message",
  uri: "echo://",
  uriTemplate: "echo://{message}",
  inputSchema: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description: "The message to echo",
      },
    },
    required: ["message"],
  },
};

// Echo Prompt
const ECHO_PROMPT: Prompt = {
  name: "echo",
  description: "Echo prompt that processes the input message",
  arguments: [
    {
      name: "message",
      description: "The message to process",
      required: true,
    },
  ],
};

// Tool Handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [ECHO_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "echo") {
    await server.sendLoggingMessage({
      level: "info",
      data: "Echo tool " + JSON.stringify(request.params.arguments),
    });
    const input = request.params.arguments as { message: string };
    return {
      content: [{ type: "text", text: `Tool echo: ${input.message}` }],
    };
  }

  throw new McpError(
    ErrorCode.MethodNotFound,
    `Unknown tool: ${request.params.name}`
  );
});

// Resource Handlers
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [ECHO_RESOURCE],
}));

// Completion Handler
server.setRequestHandler(CompleteRequestSchema, async (request) => {
  const { ref, argument } = request.params;

  if (ref.type === "ref/resource" && ref.uri.startsWith("echo://")) {
    const message = argument.value as string;
    return {
      completion: {
        uri: `echo://${message}`,
      },
    };
  }

  throw new McpError(
    ErrorCode.MethodNotFound,
    `Unsupported reference type: ${ref.type}`
  );
});

// Resource Read Handler
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri.startsWith("echo://")) {
    const message = uri.replace("echo://", "");
    return {
      contents: [
        {
          uri,
          text: `Resource echo: ${message}`,
        },
      ],
    };
  }

  throw new McpError(ErrorCode.MethodNotFound, `Unknown resource URI: ${uri}`);
});

// Prompt Handlers
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [ECHO_PROMPT],
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name === "echo") {
    const message = request.params.arguments?.message as string;
    if (!message) {
      throw new McpError(ErrorCode.InvalidParams, "Message is required");
    }
    return {
      description: "Echo prompt",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please process this message: ${message}`,
          },
        },
      ],
    };
  }

  throw new McpError(
    ErrorCode.MethodNotFound,
    `Unknown prompt: ${request.params.name}`
  );
});

// Resource Template Handlers
server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
  resourceTemplates: [
    {
      name: "echo",
      description: "Echo resource template that returns the input message",
      uriTemplate: "echo://{message}",
      inputSchema: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "The message to echo",
          },
        },
        required: ["message"],
      },
    },
  ],
}));

server.onerror = (error: any) => {
  console.error(error);
};

process.on("SIGINT", async () => {
  await server.close();
  process.exit(0);
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  await server.sendLoggingMessage({
    level: "info",
    data: "Server started successfully",
  });
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
