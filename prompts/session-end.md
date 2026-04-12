---
name: session-end
description: Extracts durable knowledge from a conversation into the wiki
timing: session close or manual
---

# Prompt: Session End — Conversation Extraction

Use this when the session is closing or when the user explicitly asks to preserve what happened in the conversation. The fenced block below is the filing prompt Alexandria can return through the `extract_session` MCP tool. Length is acceptable here — this runs occasionally, not every turn.

```
# Alexandria — Session End

The conversation above is about to be lost. Preserve the work that mattered. This is your one chance to file what surfaced in this session into the wiki so future sessions can build on it.

## What to extract

Walk back through the full conversation and identify durable signal:

1. **Decisions reached** — conclusions, choices, commitments, design picks, things you and the user converged on.
2. **Ideas that landed** — concepts, insights, framings, or approaches that emerged and held up under discussion.
3. **Design directions** — architectural moves, plans, pivots, or new approaches to existing problems.
4. **Novel connections** — links between existing wiki pages, projects, or concepts that weren't explicit before.
5. **Corrections** — places where prior wiki content was wrong, outdated, or superseded by what was discussed.
6. **Established facts** — concrete information about projects, systems, or domains that should be referenceable later.

## What to drop

- False starts, abandoned tangents, ideas that got rejected.
- Clarifying back-and-forth that didn't converge.
- Meta-conversation about tools, the wiki itself, or the agent.
- Transient context that won't matter outside this session.
- Personal facts about the user (preferences, traits, mood) — those belong in the built-in memory layer, NOT the wiki. The wiki is for ideas, not for the user.

Quality bar: will this matter in 3 months? If no, drop it. Be selective. A small number of well-placed updates beats a flood of mediocre ones.

## How to integrate it

For each item you decide to keep:

1. **Find the right home.** Use the `search` MCP tool to locate existing pages on the topic. Read the top 2–3 hits before deciding where the new content goes.
2. **Prefer updates over new pages.** If an existing page covers the topic, update it in place. Integrate the new content into the existing structure — don't bolt on a section labeled "from session X". Rewrite for coherence.
3. **Only create new pages when nothing fits.** Duplicate or near-duplicate pages are worse than no page at all. If you create one, it must have proper frontmatter (`title`, `created`, `updated`, `tags`, `sources`) and a clear distinct topic.
4. **Connect everything.** Every new or updated page must link to at least one related page via `[[wikilinks]]`. Isolated pages are dead pages. Look for opportunities to add links to *other* pages pointing back at what you just changed.
5. **Bump frontmatter.** Set `updated:` to today's date on every page you touch.
6. **Be precise.** File facts and decisions in the user's voice. Don't editorialize, don't soften, don't pad.

## After filing

1. Append one line to `log.md` in this format: `## [YYYY-MM-DD] extract | brief summary of what was filed` (newest first).
2. Call the `index_build` MCP tool to rebuild the search index so the new content is searchable in the next session.
3. Report back to the user with a short summary of what was filed and where (use `[[wikilinks]]` so they can navigate).

If nothing in the conversation is worth filing, say so explicitly and skip the log entry. Don't fabricate work.
```
