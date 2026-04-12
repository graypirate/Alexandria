---
name: wiki-lint
description: Run a health check on the user's wiki. Use when the user asks to lint, audit, clean up, check, or fix the wiki — or when they suspect orphans, broken wikilinks, stale pages, missing frontmatter, or contradictions between pages. Combines structural checks (zero token cost) with semantic review (LLM reasoning).
trigger: manual / scheduled
tokens: ~variable (structural: ~0, semantic: ~2000-5000 depending on wiki size)
---

# Skill: Wiki Lint

Comprehensive health check for the wiki. Catches structural issues via script and semantic issues via LLM reasoning.

## Trigger

- **Manual**: User invokes `/wiki-lint`
- **Scheduled**: If daemon is active, runs on configured schedule (e.g., weekly)

## Flow

### Phase 1: Structural Checks (Tool: `lint_structural`)

Zero token cost. Runs pure logic on the file system.

```
Input: { wikiPath?: string, staleDays?: number }
Output: { orphans: string[], brokenLinks: {...}, missingFrontmatter: {...}, notInIndex: string[], stale: {...}, unlinkedSources: string[] }
```

**Checks performed:**

1. **Orphan pages**: Pages with no inbound wikilinks from other wiki pages
2. **Broken wikilinks**: `[[wikilinks]]` pointing to non-existent pages
3. **Missing frontmatter**: Wiki pages lacking required frontmatter fields (title, created, updated, tags)
4. **Index gaps**: Pages existing in `wiki/` but not listed in `index.md`
5. **Stale pages**: Pages not updated in >30 days (configurable)
6. **Unlinked files**: Files in `raw/` not referenced in any wiki page's `sources` field

**Output format:**

```json
{
  "orphans": ["wiki/path/page1.md"],
  "brokenLinks": [
    { "page": "wiki/path/page1.md", "link": "[[wiki/nonexistent]]" }
  ],
  "missingFrontmatter": ["wiki/path/page2.md"],
  "notInIndex": ["wiki/path/page3.md"],
  "stale": [
    { "page": "wiki/path/page4.md", "lastUpdated": "2026-03-01" }
  ],
  "unlinkedSources": ["raw/assets/image.png"]
}
```

### Phase 2: Semantic Checks (LLM)

Token cost applies. LLM reads pages and applies reasoning.

**Checks performed:**

1. **Contradictions**: Do related pages make conflicting claims?
   - LLM reads pairs of pages that link to each other
   - Checks for factual disagreements on shared topics
   
2. **Superseded claims**: Has information in a page been updated elsewhere?
   - Compares `updated:` dates against claim recency
   - Flags pages with old information that contradicts newer pages
   
3. **Concept gaps**: Are there topics mentioned but lacking dedicated pages?
   - LLM scans for significant concepts without their own page
   - Suggests pages worth creating
   
4. **Data gaps**: What important information is missing?
   - Identifies assertions that lack supporting sources
   - Flags claims that seem to need verification

### Phase 3: Report Assembly

LLM assembles findings into a readable report:

```
## Wiki Lint Report — [YYYY-MM-DD]

### Structural Issues (fixed automatically)
- [N] orphan pages found
- [N] broken wikilinks found
- [N] pages missing frontmatter
- [N] pages not in index
- [N] stale pages (>30 days)
- [N] unlinked sources

### Semantic Issues (requires review)
- **Contradictions**: [list with page citations]
- **Superseded claims**: [list with page citations]
- **Concept gaps**: [suggested pages to create]
- **Data gaps**: [claims needing sources or verification]

### Recommended Actions
1. [Most important fix]
2. [Second priority]
3. [Investigation suggestions]
```

### Phase 4: Fix Application

**Structural fixes** (LLM applies automatically with user consent):
- Add orphan pages to index with a "stub" note
- Fix broken wikilinks (if target is clear)
- Add missing frontmatter to pages

**Semantic fixes** (LLM proposes, user approves):
- Update contradicted pages with corrected information
- Create new pages for concept gaps
- Add `[needs-verification]` tags to unsubstantiated claims

### Phase 5: Index Rebuild (Tool: `index_build`)

After any page modifications, rebuild the search index.

### Phase 6: Log Entry (LLM)

LLM appends to `log.md`:

```
## [YYYY-MM-DD] lint | [N] structural, [N] semantic issues found
```

## Output Format

```
## Wiki Lint Report — [YYYY-MM-DD]

[Full report as above]

Run /wiki-lint-apply to apply automatic fixes, or review manually.
```

## Edge Cases

- **Completely empty wiki**: Report "Wiki is empty — nothing to lint" and suggest `/wiki-ingest`
- **Very large wiki (>500 pages)**: Offer to lint only a subset (by tag, by folder, or by recency)
- **No issues found**: Report "Wiki health: Excellent" with a positive note
- **Tool error**: Report error, suggest running individual checks manually
- **LLM contradiction check timeout**: Reduce scope to top-50 most-linked pages

## Configuration

Via `.alexandria.json`:
```json
{
  "lint": {
    "staleDays": 30,
    "autoFixBrokenLinks": true,
    "autoAddToIndex": true
  }
}
```

If linting surfaces durable design decisions or corrections worth preserving beyond the report itself, file them into the wiki and rebuild the index. Use `extract_session` separately when the goal is to preserve the broader conversation, not just the lint findings.
