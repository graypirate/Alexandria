#!/usr/bin/env bun
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { createSearchTool } from "./tools/search.js";
import { createIndexBuildTool } from "./tools/index-build.js";
import { createLintStructuralTool } from "./tools/lint-structural.js";
import { createScaffoldTool } from "./tools/scaffold.js";
import { createDetectNewTool } from "./tools/detect-new.js";
import { createExtractSessionTool } from "./tools/extract-session.js";
import { findAlexandriaConfig, loadBundledPrompt } from "./utils.js";

const tools = [
  createSearchTool(),
  createIndexBuildTool(),
  createLintStructuralTool(),
  createScaffoldTool(),
  createDetectNewTool(),
  createExtractSessionTool(),
];

const configuredWikiPath = findAlexandriaConfig()?.wikiPath || "<WIKI_PATH>";
const sessionStartInstructions = loadBundledPrompt("session-start.md").replaceAll(
  "[WIKI_PATH]",
  configuredWikiPath
);

const server = new Server(
  {
    name: "alexandria",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
    instructions: sessionStartInstructions,
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    return {
      content: [{ type: "text", text: `Tool "${name}" not found` }],
      isError: true,
    };
  }

  try {
    const result = await (tool.execute as (a: any) => any)(args || {});
    return result;
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
