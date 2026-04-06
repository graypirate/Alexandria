import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ScaffoldConfig } from "../types.js";

interface ScaffoldParams {
  path: string;
  name: string;
  purpose?: string;
  focusFolders: string[];
}

function createDirectoryStructure(basePath: string, focusFolders: string[]): void {
  const dirs = [
    join(basePath, "raw", "assets"),
    join(basePath, "wiki"),
    ...focusFolders.map((f) => join(basePath, "wiki", f)),
  ];

  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }
}

function generateCLAUDEMD(name: string, purpose: string, focusFolders: string[]): string {
  const focusList =
    focusFolders.length > 0
      ? focusFolders.map((f) => `    - ${f}/`).join("\n")
      : "    - [focus-folder]";

  return `# ${name} Schema

## Structure

\`\`\`
${name}/
├── CLAUDE.md              # this file — conventions and workflows
├── index.md               # master index of all wiki pages
├── log.md                 # global activity log
├── raw/                   # single intake folder for all source material
│   └── assets/            # images and non-text files
└── wiki/                  # all wiki pages live here
${focusList}
    └── *.md
\`\`\`

Focus folders (like \`wiki/agents/\`) are created when a topic spans what would traditionally be separate "research" and "project" concerns. A topic like agents is both research and a build — it doesn't make sense to split it. New focus folders are created as needed when topics get deep enough.

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
- All wiki pages live under \`wiki/\`, with focus subfolders for deep topics.
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
- Groups pages by focus area, with a General section for ungrouped pages.
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

function generateIndexMD(focusFolders: string[]): string {
  let content = "# Index\n\n";

  for (const folder of focusFolders) {
    const title = folder
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    content += `## ${title}\n\n`;
    content += `Focus area.\n`;
    content += `- [[wiki/${folder}/]] — \n\n`;
  }

  content += "## General\n\n";
  content += "Pages that don't fit a specific focus area.\n";

  return content;
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
      "Initialize a new wiki with folder structure, schema files, and Alexandria config. Creates: raw/assets/, wiki/ with focus folders, index.md, log.md, CLAUDE.md, and .alexandria.json. Call this once when setting up a new wiki.",
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
        focusFolders: {
          type: "array",
          items: { type: "string" },
          description: "List of focus folder names (e.g., ['agents', 'research']).",
        },
      },
      required: ["path", "name", "focusFolders"],
    },
    execute: async (args: ScaffoldParams) => {
      const { path, name, focusFolders } = args;
      const purpose = args.purpose || "Personal knowledge base";

      if (existsSync(path)) {
        const files = [
          "index.md",
          "log.md",
          "CLAUDE.md",
          ".alexandria.json",
          ...focusFolders.map((f) => `wiki/${f}/`),
        ];
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

      createDirectoryStructure(path, focusFolders);

      const claudeContent = generateCLAUDEMD(name, purpose, focusFolders);
      writeFileSync(join(path, "CLAUDE.md"), claudeContent, "utf-8");

      const indexContent = generateIndexMD(focusFolders);
      writeFileSync(join(path, "index.md"), indexContent, "utf-8");

      const logContent = generateLogMD(name);
      writeFileSync(join(path, "log.md"), logContent, "utf-8");

      const config: ScaffoldConfig = {
        wikiPath: path,
        wikiName: name,
        focusFolders,
        created: new Date().toISOString().split("T")[0],
        version: "1.0",
      };
      writeFileSync(join(path, ".alexandria.json"), generateAlexandraConfig(config), "utf-8");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "ok",
                wikiPath: path,
                name,
                focusFolders,
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
