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
│   ├── hooks/
│   │   └── session-start.ts  # SessionStart hook script (Claude Code)
│   ├── tools/
│   │   ├── search.ts         # → search tool
│   │   ├── index-build.ts    # → index_build tool (+ buildIndex helper)
│   │   ├── lint-structural.ts # → lint_structural tool
│   │   ├── scaffold.ts       # → scaffold tool
│   │   └── detect-new.ts     # → detect_new tool
│   ├── types.ts
│   └── utils.ts
├── skills/                    # Agent-facing skill definitions (Claude Code)
│   ├── wiki/SKILL.md         # Context retrieval
│   ├── wiki-init/SKILL.md    # Wiki initialization
│   ├── wiki-ingest/SKILL.md  # Source processing
│   └── wiki-lint/SKILL.md    # Health checks
├── hooks/                     # Hook prompt sources (read by src/hooks/*)
│   ├── session-start.md
│   └── session-end.md
├── .claude-plugin/plugin.json # Claude Code plugin manifest
├── .codex-plugin/plugin.json  # Codex manifest
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

| Platform    | MCP server | Skills | Hooks | Notes |
|-------------|:----------:|:------:|:-----:|-------|
| Claude Code | ✓ | ✓ | ✓ | Full plugin via `.claude-plugin/plugin.json` |
| Codex CLI   | ✓ | — | — | MCP only via `~/.codex/config.toml`. Copy `hooks/session-start.md` into `AGENTS.md` for awareness. |
| OpenCode    | ✓ | — | — | MCP only via `opencode.json`. Skills/hooks would need a real OpenCode plugin file (TS export). |

## Setup

### 1. Install dependencies

```bash
cd /path/to/Alexandria
bun install
```

### 2. Install for your agent

#### Claude Code

Full plugin support — skills, hooks, and the MCP server are all wired by `.claude-plugin/plugin.json`. From inside Claude Code:

```
/plugin marketplace add /path/to/Alexandria
/plugin install alexandria@alexandria
```

#### Codex CLI

Codex supports the MCP server but has no plugin concept for skills or hooks. Register the server with:

```bash
codex mcp add alexandria -- bun /path/to/Alexandria/src/index.ts
```

Or edit `~/.codex/config.toml` directly:

```toml
[mcp_servers.alexandria]
command = "bun"
args = ["/path/to/Alexandria/src/index.ts"]
```

For session-start awareness without hooks, copy the prompt from `hooks/session-start.md` into your project's `AGENTS.md` (Codex auto-loads it).

#### OpenCode

OpenCode also supports the MCP server but uses a different plugin model (TS files in `.opencode/plugins/` exporting a function — see [opencode.ai/docs/plugins](https://opencode.ai/docs/plugins/)). For the MCP server only, add to `opencode.json`:

```json
{
  "mcp": {
    "alexandria": {
      "type": "local",
      "command": ["bun", "/path/to/Alexandria/src/index.ts"]
    }
  }
}
```

For session-start awareness, copy the prompt from `hooks/session-start.md` into your project's `AGENTS.md`.

### 3. Initialize a wiki (first time only)

```
/wiki-init
```

The agent will ask for wiki location, name, and purpose, then scaffold the folder structure, schema, config (`.alexandria.json` written to both the wiki root and `~/.alexandria.json`), and an initial empty search index.

## Search Index Design

Alexandria uses a precomputed `search-index.json` that lives at the wiki root. It is **not** the same as `index.md` — the latter is a human/agent-readable table of contents, the former is a data structure that the `search` tool consumes and is never shown to the agent.

The index holds:

- **`pages`** — `{ path → { title, headings, firstParagraph, body, updated, links } }`. One entry per wiki page, with the structural fields the BM25 ranker needs.
- **`termIndex`** — inverted index `{ term → { path → frequency } }`. Lets BM25 score in O(query terms) instead of O(all pages × all words).
- **`pageRank`** — `{ path → score }`, precomputed from the wikilink graph. PageRank is iterative, so it's cached.

`search` returns ranked results with snippets via `final_score = BM25(query, page) × (1 + α × PageRank(page))`, with structural weighting (title × 10, headings × 5, first paragraph × 3, body × 1).

**Index lifecycle:**

- `scaffold` builds an empty index on `wiki-init`.
- `wiki-ingest` and `wiki-lint` should call `index_build` after writing pages.
- `search` lazy-builds the index if it's missing on first call, so day-one queries work even without an explicit build step.

**Why a JSON cache instead of scanning on every query?** The agent doesn't pay any tokens to read the cache — the script reads it directly. Without the cache, every `search` call would walk the entire wiki, parse frontmatter, tokenize, and recompute PageRank. At hundreds of pages that's seconds of I/O per query and defeats the point.

**Future migration paths** (deferred until the JSON cache stops fitting):

- **SQLite + FTS5** via `bun:sqlite`. BM25 built-in, incremental row updates instead of full rebuilds, PageRank stored as a column. Scoring code ports directly; only the storage layer changes. The path if retrieval remains Alexandria's value prop.
- **Agent grep**. Drop custom retrieval entirely, expose `wiki_list` / `wiki_read`, and let the host agent use its own Grep/Glob tools with a SKILL.md that directs it. No index, no cache, no staleness. The path if the lifecycle (hooks, ingest, lint, session continuity) is the real value prop and search is incidental.

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