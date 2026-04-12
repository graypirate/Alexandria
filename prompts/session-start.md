---
name: session-start
description: Injects wiki awareness into context at session start
timing: session start
---

# Prompt: Session Start — Awareness Injection

The fenced block below is what Alexandria exposes through MCP `instructions`. `[WIKI_PATH]` is templated by the host when used as a project prompt template. Keep this block short — it persists in context for every turn of the session.

```
# Alexandria

Wiki at [WIKI_PATH] is the persistent store for ideas, projects, concepts, decisions, research. Built-in memory is for the user (preferences, traits) — keep them separate.

Default to the wiki when the conversation touches ideas or projects: read it with the `search` MCP tool, write to it when something durable surfaces.

- User opens with a reference to past work → call `search` immediately, read the top hits.
- Conversation drifts into a wiki-relevant topic mid-session → search the wiki before guessing from memory.
- New exploratory ideas with no wiki footprint → just talk. Search is leverage, not a tax.

Don't announce searches. See `CLAUDE.md` in the wiki root for schema.
```
