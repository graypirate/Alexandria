---
name: wiki-init
description: Initialize a brand-new wiki for the user. Use ONLY when the user explicitly says they want to create, set up, or start a new wiki — never auto-trigger. Asks for path, name, and purpose, then scaffolds folder structure, schema, config, and an empty search index.
trigger: manual only
tokens: ~500 (gathering preferences) + variable (scaffold execution)
---

# Skill: Wiki Init

First-time setup for a new wiki. Creates the folder structure, schema files, and configures Alexandria to manage the wiki.

## Trigger

Manual only — user invokes `/wiki-init`. Not auto-triggered.

## Prerequisites

- User must confirm they want to create a new wiki (not migrate an existing one)
- Target directory must be empty or user confirms overwrite

## Flow

### 1. User Preferences Gathering (LLM)

The LLM asks the user for:

1. **Wiki location**: Absolute path on disk (e.g., `/Path/To/Wiki`)
2. **Wiki purpose**: 1-2 sentence description of what the wiki is for
3. **Naming preference**: How to name the wiki (user provides a name)

### 2. Preferences Validation

LLM confirms the details back to the user before proceeding:

```
I'll create a wiki called "[Name]" at [path] with the following structure:
- raw/ (source material intake)
  - assets/ (for images, PDFs, etc.)
- wiki/ (wiki pages)
- index.md
- log.md
- [AGENT/CLAUDE].md (Alexandria schema)

Ready to proceed? (yes/no)
```

### 3. Scaffold Execution (Tool: `scaffold`)

Tool receives: `{ path: string, name: string, purpose?: string}`

Tool creates:
```
wiki-root/
├── raw/
│   └── assets/
├── wiki/
├── index.md
├── log.md
└── [AGENT/CLAUDE].md
```

### 4. Schema Generation (LLM + Tool)

LLM generates the `[AGENT/CLAUDE].md` schema tailored to the user's answers, then writes it via the host agent's file write capability.

Schema includes:
- Folder structure documentation
- Source/raw conventions (immutable intake, frontmatter requirements)
- Wiki page conventions (frontmatter, wikilinks, tags)
- Index conventions
- Log conventions
- Workflows (ingest, query, lint)

### 5. Initial Files

Tool creates:
- `index.md` with header and "General" section for unorganized pages
- `log.md` with header and first entry: `## [YYYY-MM-DD] init | Wiki created: [name]`

### 6. Alexandria Config

Tool creates `.alexandria.json` in the wiki root:

```json
{
  "wikiPath": "/absolute/path/to/wiki",
  "wikiName": "Name",
  "created": "YYYY-MM-DD",
  "version": "1.0"
}
```

Note: Focus folders (like `wiki/agents/`) are created later, as topics emerge and grow deep enough to warrant their own folder. They are lightweight organizational aids, not a rigid structure.

### 7. Hook Installation (if host supports it)

If the host agent supports hook configuration, the LLM configures:
- Session start hook → injects awareness prompt
- Session end hook → injects conversation extraction prompt

This step is host-dependent and may need manual configuration.

## Output Format

```
✓ Wiki "[Name]" initialized at [path]
✓ Folder structure created
✓ Schema written to [AGENT/CLAUDE].md
✓ Index and log created
✓ Alexandria config written to .alexandria.json

Next steps:
1. Drop source material into raw/ to start building your wiki
2. Use /wiki-ingest to process sources into wiki pages
3. Alexandria will automatically retrieve relevant context in new sessions
```

## Edge Cases

- **Directory not empty**: Ask user to confirm overwrite or choose different path
- **Permission denied**: Report error with the specific path that failed
- **Host doesn't support hooks**: Inform user that hook installation is manual and provide instructions
