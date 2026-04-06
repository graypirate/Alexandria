import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import type { AlexandriaConfig } from "./types.js";

const HOME = process.env.HOME || "";
const CONFIG_SEARCH_PATHS = [
  join(HOME, ".config", "alexandria.json"),
  join(HOME, ".alexandria.json"),
];

export function findAlexandriaConfig(startPath?: string): AlexandriaConfig | null {
  if (startPath) {
    const configPath = join(startPath, ".alexandria.json");
    if (existsSync(configPath)) {
      try {
        return JSON.parse(readFileSync(configPath, "utf-8"));
      } catch {
        return null;
      }
    }
  }

  for (const configPath of CONFIG_SEARCH_PATHS) {
    if (existsSync(configPath)) {
      try {
        return JSON.parse(readFileSync(configPath, "utf-8"));
      } catch {
        continue;
      }
    }
  }

  return null;
}

export function getWikiPath(providedPath?: string): string {
  if (providedPath) return providedPath;

  const config = findAlexandriaConfig();
  if (config?.wikiPath) return config.wikiPath;

  return process.cwd();
}
