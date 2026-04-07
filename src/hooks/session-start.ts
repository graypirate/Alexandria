#!/usr/bin/env bun
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findAlexandriaConfig } from "../utils.js";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..", "..");
const promptPath = join(pluginRoot, "hooks", "session-start.md");

function extractPrompt(md: string): string {
  const withoutFrontmatter = md.replace(/^---[\s\S]*?---\n/, "");
  const fenceMatch = withoutFrontmatter.match(/```[\s\S]*?\n([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  return withoutFrontmatter.trim();
}

function main() {
  const config = findAlexandriaConfig();
  if (!config?.wikiPath || !existsSync(config.wikiPath)) {
    process.exit(0);
  }

  let promptTemplate: string;
  try {
    promptTemplate = extractPrompt(readFileSync(promptPath, "utf-8"));
  } catch {
    process.exit(0);
  }

  const additionalContext = promptTemplate.replaceAll(
    "[WIKI_PATH]",
    config.wikiPath
  );

  const output = {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext,
    },
  };

  process.stdout.write(JSON.stringify(output));
}

main();
