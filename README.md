# Alexandria

An MCP server plus portable `SKILL.md` workflows for making LLM knowledge bases active: searchable, maintainable, and reusable across sessions.

## Background

Inspired by [@karpathy](https://x.com/karpathy)'s [LLM wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f), Alexandria exists to stop making the human micromanage the wiki. The wiki should be a durable artifact the agent can read, update, lint, and extend on its own.

The current design is intentionally simple:

- MCP tools do the filesystem-heavy work.
- Portable skills in `.agents/skills/` tell the host agent when to use those tools.
- Prompt assets in `prompts/` provide default awareness and manual end-of-session extraction without relying on a host-specific plugin system.

## Layout

```text
Alexandria/
├── .agents/
│   └── skills/
│       ├── wiki/SKILL.md
│       ├── wiki-init/SKILL.md
│       ├── wiki-ingest/SKILL.md
│       └── wiki-lint/SKILL.md
├── prompts/
│   ├── session-start.md
│   └── session-end.md
├── src/
│   ├── index.ts
│   ├── tools/
│   │   ├── search.ts
│   │   ├── index-build.ts
│   │   ├── lint-structural.ts
│   │   ├── scaffold.ts
│   │   ├── detect-new.ts
│   │   └── extract-session.ts
│   ├── types.ts
│   └── utils.ts
├── templates/
│   └── AGENTS.md.example
├── package.json
├── tsconfig.json
└── README.md
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `search` | BM25 + PageRank search across wiki pages |
| `index_build` | Rebuild the search index after wiki changes |
| `lint_structural` | Find orphans, broken links, stale pages, and index gaps |
| `scaffold` | Create a new wiki root and schema |
| `detect_new` | Find files in `raw/` that have not been filed yet |
| `extract_session` | Return the end-of-session filing prompt for manual extraction |

## Skills vs Tools

`SKILL.md` files describe when and how the host should use Alexandria. MCP tools perform the operations.

- Skills live in `.agents/skills/` so they can be copied or symlinked into whatever skill search path your host uses.
- Tools are exposed through MCP and are host-agnostic.
- The MCP server also exposes startup awareness through the MCP `instructions` field.

## Setup

### 1. Install dependencies

```bash
cd /path/to/Alexandria
bun install
```

### 2. Register the MCP server

Run it directly:

```bash
bun src/index.ts
```

Or register it with your host, for example in Codex:

```bash
codex mcp add alexandria -- bun /path/to/Alexandria/src/index.ts
```

Equivalent config:

```toml
[mcp_servers.alexandria]
command = "bun"
args = ["/path/to/Alexandria/src/index.ts"]
```

Any MCP client that respects the `instructions` field will receive Alexandria's session-start guidance on connect.

### 3. Install the skills

The portable skill source of truth is `.agents/skills/`.

For a global install in hosts that read `~/.agents/skills`:

```bash
mkdir -p ~/.agents/skills
ln -s /path/to/Alexandria/.agents/skills/wiki ~/.agents/skills/wiki
ln -s /path/to/Alexandria/.agents/skills/wiki-init ~/.agents/skills/wiki-init
ln -s /path/to/Alexandria/.agents/skills/wiki-ingest ~/.agents/skills/wiki-ingest
ln -s /path/to/Alexandria/.agents/skills/wiki-lint ~/.agents/skills/wiki-lint
```

If your host prefers a different skill directory, copy the same folders there. The format is plain `SKILL.md`, not a plugin package.

### 4. Add project awareness where needed

If your host does not surface MCP `instructions` reliably, copy [templates/AGENTS.md.example](templates/AGENTS.md.example) into the target project's `AGENTS.md` and replace `<WIKI_PATH>`.

### 5. Initialize a wiki

Invoke `/wiki-init` or otherwise trigger the `wiki-init` skill. Alexandria scaffolds:

- `raw/` and `raw/assets/`
- `wiki/`
- `index.md`
- `log.md`
- `CLAUDE.md`
- `AGENTS.md`
- `.alexandria.json`
- `search-index.json`

## Manual Session Extraction

There is no plugin-only session-end hook anymore. The portable write-side path is the `extract_session` MCP tool.

Use it when:

- the user asks to preserve what happened in the conversation
- you are wrapping a long session and want to file durable knowledge
- your host has no real end-of-session automation

`extract_session` returns Alexandria's filing prompt. Apply it, update the relevant wiki pages, append to `log.md` if needed, then call `index_build`.

## Search Index Design

Alexandria stores a precomputed `search-index.json` at the wiki root. This is separate from `index.md`:

- `index.md` is the human-readable table of contents.
- `search-index.json` is the cached data structure used by `search`.

The index contains:

- `pages`: `{ path -> { title, headings, firstParagraph, body, updated, links } }`
- `termIndex`: inverted index `{ term -> { path -> frequency } }`
- `pageRank`: precomputed rank scores from the wikilink graph

Ranking is `BM25(query, page) * (1 + alpha * PageRank(page))` with structural boosts:

- title × 10
- headings × 5
- first paragraph × 3
- body × 1

Lifecycle:

- `scaffold` creates the initial empty index
- `search` lazy-builds it if missing
- `index_build` should run after any wiki writes

The cache exists so the agent does not re-scan and re-tokenize the entire wiki on every query.

## Wiki Structure

```text
wiki-root/
├── .alexandria.json
├── index.md
├── log.md
├── CLAUDE.md
├── AGENTS.md
├── raw/
│   └── assets/
└── wiki/
    └── [focus]/
```
