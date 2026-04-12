import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, relative } from "node:path";
import type { LintResult } from "../types.js";
import { getWikiPath } from "../utils.js";

interface LintParams {
  wikiPath?: string;
  staleDays?: number;
}

function extractFrontmatterFields(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const fm: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim().replace(/^["']|["']$/g, "");
      fm[key] = value;
    }
  }
  return fm;
}

function checkFrontmatter(content: string): string[] {
  const fm = extractFrontmatterFields(content);
  const required = ["title", "created", "updated", "tags"];
  return required.filter((f) => !fm[f]);
}

function extractWikilinks(content: string): string[] {
  const matches = content.matchAll(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g);
  return Array.from(matches).map((m) => m[1].trim());
}

function readDirRecursive(dir: string): string[] {
  const files: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== "assets" && entry.name !== ".git") {
        files.push(...readDirRecursive(fullPath));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist
  }
  return files;
}

function getWikiPages(wikiPath: string): string[] {
  const wikiDir = join(wikiPath, "wiki");
  return readDirRecursive(wikiDir).filter((f) => extname(f) === ".md");
}

function getRawSources(wikiPath: string): string[] {
  const rawDir = join(wikiPath, "raw");
  const files = readDirRecursive(rawDir);
  return files.filter((f) => {
    const ext = extname(f).toLowerCase();
    return [".md", ".txt", ".pdf", ".png", ".jpg", ".jpeg", ".gif"].includes(ext);
  });
}

function getIndexEntries(wikiPath: string): string[] {
  try {
    const indexPath = join(wikiPath, "index.md");
    const content = readFileSync(indexPath, "utf-8");
    const matches = content.matchAll(/\[\[([^\]]+)\]\]/g);
    return Array.from(matches).map((m) => m[1].trim());
  } catch {
    return [];
  }
}

function getSourcesFromPages(wikiPath: string): Set<string> {
  const pages = getWikiPages(wikiPath);
  const sources = new Set<string>();

  for (const page of pages) {
    try {
      const content = readFileSync(page, "utf-8");
      const fm = extractFrontmatterFields(content);
      if (fm.sources) {
        const sourcesList = fm.sources
          .replace(/[\[\]]/g, "")
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""));
        for (const source of sourcesList) {
          if (source) sources.add(source);
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  return sources;
}

function buildWikilinkIndex(wikiPath: string): Map<string, Set<string>> {
  const pages = getWikiPages(wikiPath);
  const outbound = new Map<string, Set<string>>();

  for (const page of pages) {
    const relPath = relative(wikiPath, page).replace(/\\/g, "/");
    const content = readFileSync(page, "utf-8");
    const links = extractWikilinks(content);
    outbound.set(relPath, new Set(links));
  }

  return outbound;
}

function checkOrphans(wikiPath: string, outboundLinks: Map<string, Set<string>>): string[] {
  const pages = getWikiPages(wikiPath);
  const pageSet = new Set(pages.map((p) => relative(wikiPath, p).replace(/\\/g, "/")));

  const orphans: string[] = [];

  for (const page of pageSet) {
    if (pageSet.size <= 1) break;

    let hasInbound = false;
    for (const [sourcePage, links] of outboundLinks) {
      const normalizedSource = sourcePage.startsWith("wiki/") ? sourcePage : "wiki/" + sourcePage;
      const normalizedTarget = page.startsWith("wiki/") ? page : "wiki/" + page;

      if (links.has(normalizedSource) || links.has(normalizedTarget)) {
        hasInbound = true;
        break;
      }
    }

    if (!hasInbound) {
      orphans.push(page);
    }
  }

  return orphans;
}

function checkBrokenLinks(
  wikiPath: string,
  outboundLinks: Map<string, Set<string>>
): Array<{ page: string; link: string; target: string }> {
  const pages = getWikiPages(wikiPath);
  const pageSet = new Set(pages.map((p) => relative(wikiPath, p).replace(/\\/g, "/")));

  const broken: Array<{ page: string; link: string; target: string }> = [];

  for (const [page, links] of outboundLinks) {
    for (const link of links) {
      const normalized = link.startsWith("wiki/") ? link : "wiki/" + link;
      if (!pageSet.has(link) && !pageSet.has(normalized) && !link.startsWith("http")) {
        broken.push({ page, link, target: link });
      }
    }
  }

  return broken;
}

function checkMissingFrontmatter(wikiPath: string): Array<{ page: string; missing: string[] }> {
  const pages = getWikiPages(wikiPath);
  const missing: Array<{ page: string; missing: string[] }> = [];

  for (const page of pages) {
    const relPath = relative(wikiPath, page).replace(/\\/g, "/");
    try {
      const content = readFileSync(page, "utf-8");
      const fields = checkFrontmatter(content);
      if (fields.length > 0) {
        missing.push({ page: relPath, missing: fields });
      }
    } catch {
      // Skip unreadable files
    }
  }

  return missing;
}

function checkNotInIndex(wikiPath: string): string[] {
  const pages = getWikiPages(wikiPath);
  const indexed = getIndexEntries(wikiPath);

  const indexedSet = new Set(indexed);
  const notInIndex: string[] = [];

  for (const page of pages) {
    const relPath = relative(wikiPath, page).replace(/\\/g, "/");
    if (!indexedSet.has(relPath) && !indexedSet.has("wiki/" + relPath)) {
      notInIndex.push(relPath);
    }
  }

  return notInIndex;
}

function checkStale(wikiPath: string, staleDays: number): Array<{ page: string; lastUpdated: string }> {
  const pages = getWikiPages(wikiPath);
  const stale: Array<{ page: string; lastUpdated: string }> = [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - staleDays);

  for (const page of pages) {
    const relPath = relative(wikiPath, page).replace(/\\/g, "/");
    try {
      const content = readFileSync(page, "utf-8");
      const fm = extractFrontmatterFields(content);
      const updated = fm.updated || fm.date;
      if (updated) {
        const updatedDate = new Date(updated);
        if (updatedDate < cutoff) {
          stale.push({ page: relPath, lastUpdated: updated });
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  return stale;
}

function checkUnlinkedSources(wikiPath: string): string[] {
  const sources = getRawSources(wikiPath);
  const referencedSources = getSourcesFromPages(wikiPath);

  const unlinked: string[] = [];
  for (const source of sources) {
    const relPath = relative(wikiPath, source).replace(/\\/g, "/");
    if (!referencedSources.has(relPath)) {
      unlinked.push(relPath);
    }
  }

  return unlinked;
}

export function createLintStructuralTool() {
  return {
    name: "lint_structural",
    description:
      "Run a structural health check on the user's wiki. Call this when the user asks to lint, audit, clean up, or check the wiki — or when you suspect drift after many changes. Reports orphan pages (no inbound wikilinks), broken wikilinks, missing required frontmatter, pages absent from index.md, stale pages (default >30 days), and raw/ files not referenced by any wiki page. Zero token cost — pure file-system logic. After reviewing the report, propose fixes to the user, apply approved ones, then call index_build to refresh the search index.",
    inputSchema: {
      type: "object",
      properties: {
        wikiPath: {
          type: "string",
          description:
            "Absolute path to wiki root. Defaults to looking for .alexandria.json in home directory or current working directory.",
        },
        staleDays: {
          type: "number",
          description: "Number of days after which a page is considered stale. Defaults to 30.",
          default: 30,
        },
      },
    },
    execute: async (args: LintParams) => {
      const wikiPath = getWikiPath(args.wikiPath);
      const staleDays = args.staleDays || 30;

      const result: LintResult = {
        orphans: [],
        brokenLinks: [],
        missingFrontmatter: [],
        notInIndex: [],
        stale: [],
        unlinkedSources: [],
      };

      const outboundLinks = buildWikilinkIndex(wikiPath);

      result.orphans = checkOrphans(wikiPath, outboundLinks);
      result.brokenLinks = checkBrokenLinks(wikiPath, outboundLinks);
      result.missingFrontmatter = checkMissingFrontmatter(wikiPath);
      result.notInIndex = checkNotInIndex(wikiPath);
      result.stale = checkStale(wikiPath, staleDays);
      result.unlinkedSources = checkUnlinkedSources(wikiPath);

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  };
}
