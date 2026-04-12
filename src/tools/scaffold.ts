import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ScaffoldConfig } from "../types.js";
import { buildIndex } from "./index-build.js";

interface ScaffoldParams {
  path: string;
  name: string;
  purpose?: string;
  focusFolders?: string[];
}

function createDirectoryStructure(basePath: string): void {
  const dirs = [
    join(basePath, "raw", "assets"),
    join(basePath, "wiki"),
  ];

  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }
}

function generateCLAUDEMD(name: string, purpose: string): string {
  return `# ${name} Schema

## Structure

\`\`\`
${name}/
├── CLAUDE.md              # conventions and workflows (Claude Code, OpenCode)
├── AGENTS.md              # conventions and workflows (Codex) — identical content
├── index.md               # master index of all wiki pages
├── log.md                 # global activity log
├── raw/                   # single intake folder for all source material
│   └── assets/            # images and non-text files
└── wiki/                  # all wiki pages (*.md)
\`\`\`

Both CLAUDE.md and AGENTS.md contain the same schema — the platform uses whichever filename it expects.

## Purpose

${purpose}

## Conventions

### Raw sources (\`raw/\`)
- Single top-level folder. All sources go here regardless of topic.
- Immutable once added. LLM reads but never modifies.
- Human drops sources in; LLM processes them into wiki pages.
- No strict naming convention — human names files however they want.
- Images go in \`raw/assets/\`.
- Frontmatter is encouraged but not required:
  \`\`\`yaml
  ---
  title: Article Title
  source: URL or origin
  date_added: YYYY-MM-DD
  type: article | paper | video | repo | bookmark | chat-export
  ---
  \`\`\`

### Wiki pages (\`wiki/\`)
- LLM-generated and LLM-maintained. Human edits are rare and intentional.
- All wiki pages live under \`wiki/\`.
- Organized by concept, not by source type.
- One source can feed multiple wiki pages.
- Use \`[[wikilinks]]\` for cross-references (Obsidian-compatible).
- Tags connect pages across the wiki — they're the primary cross-cutting mechanism.
- Each wiki page has frontmatter:
  \`\`\`yaml
  ---
  title: Page Title
  created: YYYY-MM-DD
  updated: YYYY-MM-DD
  tags: [tag1, tag2]
  sources: [list of raw files this draws from]
  ---
  \`\`\`

### Index (\`index.md\`)
- Single master index at root. No per-folder indexes.
- Format: \`- [[wiki/path/to/page]] — one-line summary\`
- LLM updates index on every ingest.

### Log (\`log.md\`)
- Append-only, reverse chronological (newest first).
- Entry format: \`## [YYYY-MM-DD] action | Subject\`
  - Actions: \`ingest\`, \`query\`, \`lint\`, \`reorganize\`
- Helps the LLM understand recent activity and context.

## Workflows

### Ingest
1. Human drops source material into \`raw/\`.
2. LLM reads the source, discusses takeaways with human.
3. LLM creates or updates relevant wiki pages.
4. LLM updates index.
5. LLM appends a log entry.

### Query
1. LLM reads index to locate pages.
2. LLM reads relevant wiki pages and raw sources as needed.
3. LLM synthesizes an answer with citations.
4. Good answers can be filed back into the wiki as new pages.

### Lint
1. LLM scans for: contradictions, stale claims, orphan pages, missing cross-references, data gaps.
2. LLM suggests fixes and new investigations.
3. Fixes are applied; suggestions logged.
`;
}

function generateIndexMD(): string {
  return `# Index

## General

Pages are added here as they are created.
`;
}

function generateLogMD(name: string): string {
  const today = new Date().toISOString().split("T")[0];
  return `# ${name} — Log

## [${today}] init | Wiki created: ${name}
`;
}

function generateAlexandraConfig(config: ScaffoldConfig): string {
  return JSON.stringify(
    {
      wikiPath: config.wikiPath,
      wikiName: config.wikiName,
      focusFolders: config.focusFolders,
      created: config.created,
      version: config.version,
    },
    null,
    2
  );
}

export function createScaffoldTool() {
  return {
    name: "scaffold",
    description:
      "Initialize a brand-new wiki for the user. Call this ONLY when the user explicitly says they want to create, set up, or start a new wiki — never auto-trigger and never use it on an existing wiki. Asks for path, name, and purpose, then creates the folder structure (raw/assets/, wiki/), schema files (CLAUDE.md + AGENTS.md), index.md, log.md, .alexandria.json (at both wiki root and ~/.alexandria.json), and an initial empty search index so day-one queries work.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute path where the wiki should be created. Must be empty or user must confirm overwrite.",
        },
        name: {
          type: "string",
          description: "Human-readable name for the wiki.",
        },
        purpose: {
          type: "string",
          description: "Brief description of what the wiki is for. Defaults to 'Personal knowledge base'.",
        },
      },
      required: ["path", "name"],
    },
    execute: async (args: ScaffoldParams) => {
      const { path, name } = args;
      const purpose = args.purpose || "Personal knowledge base";

      if (existsSync(path)) {
        const files = ["index.md", "log.md", "CLAUDE.md", "AGENTS.md", ".alexandria.json"];
        const hasWikiContent = files.some((f) => existsSync(join(path, f)));

        if (hasWikiContent) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error:
                    "Directory is not empty. Choose an empty directory or a new path.",
                }),
              },
            ],
            isError: true,
          };
        }
      }

      createDirectoryStructure(path);

      const claudeContent = generateCLAUDEMD(name, purpose);
      writeFileSync(join(path, "CLAUDE.md"), claudeContent, "utf-8");
      writeFileSync(join(path, "AGENTS.md"), claudeContent, "utf-8");

      const indexContent = generateIndexMD();
      writeFileSync(join(path, "index.md"), indexContent, "utf-8");

      const logContent = generateLogMD(name);
      writeFileSync(join(path, "log.md"), logContent, "utf-8");

      const config: ScaffoldConfig = {
        wikiPath: path,
        wikiName: name,
        created: new Date().toISOString().split("T")[0],
        version: "1.0",
      };
      const configJson = generateAlexandraConfig(config);
      writeFileSync(join(path, ".alexandria.json"), configJson, "utf-8");
      writeFileSync(join(homedir(), ".alexandria.json"), configJson, "utf-8");

      try {
        buildIndex(path);
      } catch {
        // wiki/ is empty on first scaffold; index build is best-effort
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "ok",
                wikiPath: path,
                name,
                created: config.created,
              },
              null,
              2
            ),
          },
        ],
      };
    },
  };
}
