---
name: wiki
description: Search the user's wiki for relevant context. Use whenever the conversation references past work, named projects, prior decisions, ongoing ideas, or any topic the user treats as already-known. Call BEFORE answering from conversation memory. Also use mid-session when the topic shifts into wiki-relevant territory.
trigger: auto (first message of session) / on-demand
tokens: ~3000 (auto-triggered search + select page loads)
---

# Skill: Wiki Retrieval

Retrieves wiki pages relevant to the current message using BM25 + PageRank search and injects them into context.

## Trigger

- **Session start**: If the host respects Alexandria's MCP `instructions` field or loads the project `AGENTS.md`, use this before answering the first wiki-relevant message of the session.
- **On-demand**: User or LLM calls `/wiki <query>` mid-session to retrieve context on a new topic.

## Flow

### 1. Search (Tool: `mcp__alexandria__search`)

```
Input: { query: string, wikiPath?: string, limit?: number }
Output: { results: [{ path, title, snippet, score }], recentLog: string[] }
```

1. Parse the user's message as a query string
2. Call the `mcp__alexandria__search` MCP tool with the query
3. Tool returns ranked results: `[{ path, title, snippet, score }]`
4. Also returns last 5 log entries for recency context

### 2. Context Assembly

Script output is assembled into a prompt section (~1000 tokens):

```
## Relevant Wiki Context

### From: [[wiki/path/to/page]]
**Title:** Page Title
**Summary:** One-line description of what this page covers
**Match:** "...matching snippet with query terms highlighted..."

### Recent Activity
[Last 5 log entries]

Based on the above, the most relevant pages to load are:
1. [[wiki/path/one]] — [reason why]
2. [[wiki/path/two]] — [reason why]
```

### 3. Page Selection (LLM Decision)

LLM reviews the search results and decides which 2-4 full pages to load based on relevance to the query.

### 4. Page Loading

LLM reads the selected wiki pages in full via the host agent's file read capability.

### 5. Response

LLM responds with full continuity — referencing wiki context naturally in the response rather than announcing "based on my wiki search."

## Output Format

No structured output. The LLM integrates wiki knowledge into its response naturally.

## Edge Cases

- **No results**: Return a message indicating no relevant wiki pages found. LLM falls back to general knowledge.
- **Query too vague**: Return top-5 most recently updated pages as general context.
- **Search tool error**: Log error, return empty results, allow LLM to proceed without wiki context.

## Notes

- The LLM should search the wiki first when the user asks about something that seems like it would be documented, rather than asking the user to re-explain.
- The LLM should NOT announce "I searched the wiki and found..." — it should just use the knowledge naturally.
- Tokens are estimated at ~3000 total for auto-triggered retrieval. On-demand calls are cheaper since the query is focused.
