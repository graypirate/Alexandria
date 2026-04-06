---
name: session-start
description: Injects wiki awareness into context before first message
timing: before first message of session
tokens: ~200
---

# Hook: Session Start — Awareness Injection

Injects a static prompt before the first message of every session. Establishes context that a wiki exists and how to access it.

## When This Fires

Before the first user message of each session. Not repeated mid-session.

## What It Injects

```
You have access to a persistent wiki knowledge base at [WIKI_PATH].
The wiki is maintained by Alexandria, a plugin that keeps context persistent
across sessions.

## Wiki Conventions
- Wiki pages live at wiki/*.md with focus folders (e.g., wiki/agents/)
- Use [[wikilinks]] to link between pages (e.g., [[wiki/agents/context-library]])
- Tags cross-cut across focus areas
- The wiki is the source of truth for project state, decisions, and accumulated knowledge

## Alexandria Skills Available
- /wiki [query]     — Search wiki for context relevant to your message
- /wiki-ingest      — Process new raw sources into wiki pages
- /wiki-lint        — Check wiki health (orphans, broken links, stale content)
- /wiki-init        — Initialize a new wiki (first time only)

## Workflow
When the user asks about something that might be in the wiki:
1. Use /wiki [query] to search for relevant pages
2. Load the most relevant pages
3. Answer using wiki knowledge — don't ask the user to re-explain

The wiki is not mentioned to the user unless they ask about it directly.
```

## Injection Rules

- Do NOT include search results — this is pure priming
- Do NOT read any files — this hook is zero-token beyond the static text
- Do NOT mention the hook to the user

## Configuration

The hook reads `.alexandria.json` to get `wikiPath` for the injection.

## Edge Cases

- **No `.alexandria.json`**: Hook skips injection silently — wiki may not be configured
- **Wiki path doesn't exist**: Hook skips injection silently
- **First message is a greeting**: Still fires, but LLM handles gracefully

## Customization

The awareness prompt can be customized by editing this file. Keep it under 300 tokens.
