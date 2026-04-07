---
name: wiki-ingest
description: Process new files in the wiki's raw/ folder into wiki pages. Use when the user says they've added sources, dropped files, or wants to ingest material. Reads each new raw source, discusses takeaways, files into appropriate wiki pages, updates the index, rebuilds the search index, and logs the action.
trigger: manual
tokens: ~variable (per source: read + synthesize + file writes)
---

# Skill: Wiki Ingest

Process raw source material into wiki pages. The core ingestion workflow that transforms immutable sources into organized, cross-referenced wiki content.

## Trigger

Manual — user invokes `/wiki-ingest` after dropping files into `raw/`.

## Flow

### 1. New File Detection (Tool: `detect_new`)

```
Input: { wikiPath?: string }
Output: { newFiles: [{ path, name, type, frontmatter, size, modified }], alreadyProcessed: string[], totalRaw: number }
```

Tool scans `raw/` and compares against all `sources:` fields in existing wiki pages.

Output format:
```
[
  { path: "raw/file1.md", name: "file1.md", frontmatter: {...} },
  { path: "raw/file2.pdf", name: "file2.pdf" }
]
```

If no new files: report "No new sources to process" and exit.

### 2. Source Reading (LLM)

For each new file:

1. LLM reads the raw source
2. LLM notes: title, type (article/paper/video/repo/bookmark/chat-export), key claims, connections to existing pages

### 3. Discussion with User (Optional but Recommended)

LLM discusses takeaways with the user:

```
I found [N] new sources. Key observations:
- [File 1]: [2-3 sentence summary + why it matters]
- [File 2]: [2-3 sentence summary + why it matters]

Questions:
- [Any clarifying questions about intent or connections]
- [Any specific pages you want created/updated]

Shall I proceed with filing?
```

User can: approve, ask for specific pages, ask questions, defer.

### 4. Page Creation/Update (LLM)

For each source, LLM:

1. **Existing page needs update**: Reads the current page, integrates new information, updates `updated:` date
2. **New page needed**: Creates new wiki page with proper frontmatter
3. **Connections**: Adds `[[wikilinks]]` to related existing pages; adds tags for cross-cutting concerns

Frontmatter requirements:
```yaml
---
title: Page Title
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: [tag1, tag2]
sources: [raw/filename.md]
---
```

### 5. Index Update (LLM)

LLM updates `index.md`:
- Adds new pages under appropriate focus areas
- Updates summaries for modified pages
- Maintains the `- [[wiki/path]] — summary` format

### 6. Search Index Rebuild (Tool: `index_build`)

```
Input: { wikiPath?: string }
Output: { status: "ok", pagesIndexed: number, output: string }
```

Tool runs after all pages are updated:
1. Parses all wikilinks → builds adjacency graph
2. Computes PageRank from link graph
3. Builds BM25 full-text index with structural weighting:
   - Title × 10
   - Headings × 5
   - First paragraph × 3
   - Body × 1
4. Indexes wikilink anchor text as descriptors
5. Writes `search-index.json`

### 7. Log Entry (LLM)

LLM appends to `log.md`:

```
## [YYYY-MM-DD] ingest | [Brief description of what was filed]
```

## Output Format

```
✓ Processed [N] sources:
  - [[wiki/path/page1]] — [action taken: created/updated]
  - [[wiki/path/page2]] — [action taken: created/updated]
✓ Index updated
✓ Search index rebuilt
✓ Logged to log.md
```

## Edge Cases

- **No new files**: Exit early with "No new sources to process"
- **Source without clear page**: Ask user where to file or create a stub
- **Duplicate content**: If source overlaps significantly with existing page, ask user whether to update existing or create separate page
- **Broken wiki structure**: If index.md or log.md are missing, report error and offer to fix
- **Index write fails**: Log error, pages are still updated, user can retry `/wiki-ingest` or run `/wiki-lint`

## Notes

- Sources are immutable — the wiki page is the interpretation, not the source itself
- One source can feed multiple wiki pages (e.g., one article about context + another about agents)
- Tags are the primary cross-cutting mechanism — use them liberally
- The LLM should proactively link to related pages, not just create isolated pages
