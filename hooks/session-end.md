---
name: session-end
description: Extracts durable knowledge from conversation at session close
timing: on session end / manual trigger
tokens: ~variable (conversation length, typically 2000-5000)
---

# Hook: Session End — Conversation Extraction

Fires when a session closes. Prompts the LLM to review the conversation and file durable knowledge into the wiki.

## When This Fires

- **Session close**: When the user ends a session or the host agent shuts down
- **Manual trigger**: User invokes `/extract` or similar command mid-session

## What It Prompts

```
## Session End — Knowledge Extraction

Review the conversation above and extract durable knowledge that should be
filed into the wiki:

1. **Decisions made** — conclusions, choices, or commitments
2. **New ideas** — concepts, insights, or approaches that emerged
3. **Changed directions** — pivots, corrections, or abandoned plans
4. **New connections** — links between existing wiki pages that weren't explicit before
5. **Facts established** — information that should be referenceable

Ignore:
- False starts and abandoned tangents
- Clarifying questions that don't lead anywhere
- Back-and-forth that didn't converge
- User preferences that are personal and not project-relevant

For each item to file:
1. Search the wiki to find where it belongs
2. Update the existing page OR create a new page if no fit exists
3. Use [[wikilinks]] to connect to related pages
4. Update frontmatter: set `updated` to today's date

After filing:
- Rebuild the search index (run index-build script)
- Log the extraction to log.md: ## [YYYY-MM-DD] extract | [N] items filed
```

## Extraction Rules

1. **Be selective** — not everything is worth filing. Ask: will this matter in 3 months?
2. **Be precise** — file facts, not interpretations. Let the user correct if needed.
3. **Be connected** — every new page should link to at least 2 existing pages
4. **Update, don't duplicate** — if a page exists, update it rather than creating a near-duplicate

## Post-Extraction Actions

After the LLM completes extraction:

1. **Run `index-build.ts`** — rebuild search index with new/updated pages
2. **Append to `log.md`** — record the extraction session

## Edge Cases

- **No durable knowledge**: Report "No durable knowledge extracted" and skip log entry
- **Wiki not configured**: Skip extraction silently, log nothing
- **Extraction interrupted**: Wiki remains in pre-extraction state; no partial writes
- **Conflicting information**: Update existing pages with corrections, don't create contradictions

## Batch Sessions

If the session spans multiple days of work on the same topic:
- Treat it as one conversation for extraction purposes
- File all durable knowledge at the end, not per-day

## Notes

This hook replaces what would otherwise be manual filing. The goal is zero-effort knowledge capture — the user should not have to remember to file things. Session close is the natural trigger because:
- The conversation is fresh
- The user is done with that context
- Filing won't interrupt active work
