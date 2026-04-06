# Alexandria

An agent plugin that makes LLM knowledge bases **active** — with automatic context loading, retrieval, ingestion, and maintenance.

## Background

Inspired by [@karpathy](https://x.com/karpathy)'s [LLM wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f), I set out to make a Wiki management system of my own.
I found myself telling my agent *how* to manage and update the wiki, which wasn't the point of it. Since I don't edit it, I shouldn't have to tell it how to maintain it.
This plugin is an attempt at giving the agent the skills and tools it needs to interact with and manage your Wikis on its own.

The plugin is a work in progress; your feedback is welcomed. Use it, pull it, fork it.
Context is key. LLMs can only act on what they know and I aim to build tools that empower.

## Architecture

Alexandria uses an **MCP-first** design. All operations are exposed as MCP tools, making it compatible with any platform that supports MCP:

```
Alexandria/
├── src/                       # MCP server implementation
│   ├── index.ts              # MCP server entry (stdio transport)
│   ├── tools/
│   │   ├── search.ts        # → search tool
│   │   ├── index-build.ts   # → index_build tool
│   │   ├── lint-structural.ts # → lint_structural tool
│   │   ├── scaffold.ts      # → scaffold tool
│   │   └── detect-new.ts    # → detect_new tool
│   ├── types.ts
│   └── utils.ts
├── skills/                    # LLM-facing skill definitions
│   ├── wiki/SKILL.md         # Context retrieval guidance
│   ├── wiki-init/SKILL.md    # Wiki initialization
│   ├── wiki-ingest/SKILL.md  # Source processing
│   └── wiki-lint/SKILL.md    # Health checks
├── hooks/                     # Lifecycle hooks
│   ├── session-start.md
│   └── session-end.md
├── manifests/                  # Platform manifests
│   ├── .claude-plugin/plugin.json
│   └── .codex-plugin/plugin.json
├── package.json
├── tsconfig.json
└── README.md
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `search` | BM25 + PageRank search across wiki pages |
| `index_build` | Rebuild search index after wiki changes |
| `lint_structural` | Check for orphans, broken links, stale pages |
| `scaffold` | Create new wiki structure |
| `detect_new` | Find unprocessed files in raw/ |

## Skills vs Tools

**Skills** (`SKILL.md`) tell the LLM *when* and *how* to use wiki operations. **MCP tools** are the actual operations the LLM calls.

- Skill triggers on specific user queries
- Skill body provides guidance and context
- LLM calls MCP tool to execute operation
- LLM synthesizes result

## Platform Support

| Platform | Manifest Location | Skills | MCP |
|----------|------------------|--------|-----|
| Claude Code | `.claude-plugin/plugin.json` | ✓ | ✓ |
| OpenCode | `opencode.json` | ✓ | ✓ |
| Codex | `.codex-plugin/plugin.json` | ✓ | ✓ |
| OpenClaw | `openclaw.plugin.json` | ✓ | ✓ |

## Setup

### 1. Install dependencies

```bash
bun install
```

### 2. Configure your agent

**Claude Code**: Add to `.claude-plugin/plugin.json`:
```json
{
  "mcpServers": {
    "alexandria": {
      "command": "bun",
      "args": ["/path/to/Alexandria/src/index.ts"]
    }
  }
}
```

**OpenCode**: Add to `opencode.json`:
```json
{
  "mcpServers": {
    "alexandria": {
      "command": "bun",
      "args": ["/path/to/Alexandria/src/index.ts"]
    }
  }
}
```

**Codex**: Add to `.codex-plugin/plugin.json`:
```json
{
  "mcpServers": {
    "alexandria": {
      "command": "bun",
      "args": ["/path/to/Alexandria/src/index.ts"]
    }
  }
}
```

### 3. Initialize a wiki

```bash
/wiki-init
```

The LLM will ask for wiki location, name, and focus folders.

## Running the MCP Server Directly

```bash
bun src/index.ts
```

The server uses stdio transport, so it works with any MCP client.

## Wiki Structure

```
wiki-root/
├── .alexandria.json   # Alexandria config (created by scaffold)
├── index.md           # Master page index
├── log.md            # Activity log
├── CLAUDE.md         # Wiki schema (Claude Code, OpenCode)
├── AGENT.md          # Wiki schema (Codex) — identical content
├── raw/              # Source material (immutable)
│   └── assets/
└── wiki/             # Wiki pages
    └── [focus]/      # Focus folders
```