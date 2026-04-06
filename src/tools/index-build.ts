import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, extname, relative } from "node:path";
import type { PageContent, IndexBuildResult } from "../types.js";
import { getWikiPath } from "../utils.js";

interface IndexBuildParams {
  wikiPath?: string;
}

function readDirRecursive(dir: string): string[] {
  const files: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== "assets" && entry.name !== ".git") {
        files.push(...readDirRecursive(fullPath));
      } else if (entry.isFile() && extname(entry.name) === ".md") {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist
  }
  return files;
}

function extractFrontmatter(content: string): Record<string, string> {
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

function extractTitle(content: string, frontmatter: Record<string, string>, filename: string): string {
  if (frontmatter.title) return frontmatter.title;

  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();

  return filename.replace(/\.md$/, "").replace(/[-_]/g, " ");
}

function extractHeadings(content: string): string[] {
  const matches = content.match(/^#{1,3}\s+(.+)$/gm) || [];
  return matches.map((m) => m.replace(/^#{1,3}\s+/, "").trim());
}

function extractFirstParagraph(content: string): string {
  const withoutFrontmatter = content.replace(/^---[\s\S]*?---\n/, "");
  const paragraphs = withoutFrontmatter.split(/\n\n+/);
  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.length > 20) {
      return trimmed.replace(/[#*`\[\]]/g, "").slice(0, 500);
    }
  }
  return "";
}

function extractBody(content: string): string {
  const withoutFrontmatter = content.replace(/^---[\s\S]*?---\n/, "");
  return withoutFrontmatter
    .replace(/^#{1,3}\s+.+$/gm, "")
    .replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, "$1")
    .replace(/[#*`\[\]]/g, "")
    .replace(/\n+/g, " ")
    .trim();
}

function extractWikilinks(content: string): string[] {
  const matches = content.matchAll(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g);
  const links: string[] = [];
  for (const match of matches) {
    links.push(match[1].trim());
  }
  return links;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function buildTermIndex(pages: Record<string, PageContent>): Record<string, Record<string, number>> {
  const termIndex: Record<string, Record<string, number>> = {};

  for (const [path, page] of Object.entries(pages)) {
    const allText = [
      page.title,
      ...page.headings,
      page.firstParagraph,
      page.body,
    ]
      .join(" ")
      .toLowerCase();

    const terms = tokenize(allText);

    for (const term of terms) {
      if (!termIndex[term]) {
        termIndex[term] = {};
      }
      termIndex[term][path] = (termIndex[term][path] || 0) + 1;
    }
  }

  return termIndex;
}

function computePageRank(
  graph: Record<string, string[]>,
  iterations = 20,
  damping = 0.85
): Record<string, number> {
  const pages = new Set(Object.keys(graph));
  for (const targets of Object.values(graph)) {
    for (const target of targets) {
      pages.add(target);
    }
  }

  const pageList = Array.from(pages);
  const n = pageList.length;

  if (n === 0) return {};

  const rank: Record<string, number> = {};
  for (const page of pageList) {
    rank[page] = 1 / n;
  }

  for (let i = 0; i < iterations; i++) {
    const newRank: Record<string, number> = {};
    let danglingSum = 0;

    for (const [page, r] of Object.entries(rank)) {
      const outlinks = graph[page] || [];
      if (outlinks.length === 0) {
        danglingSum += r;
      }
    }

    for (const page of pageList) {
      let sum = 0;
      for (const [otherPage, outlinks] of Object.entries(graph)) {
        if (outlinks.includes(page)) {
          sum += rank[otherPage] / outlinks.length;
        }
      }
      newRank[page] = (1 - damping) / n + damping * (sum + danglingSum / n);
    }

    for (const page of pageList) {
      rank[page] = newRank[page] || 0;
    }
  }

  return rank;
}

function buildWikilinkGraph(pages: Record<string, PageContent>): Record<string, string[]> {
  const graph: Record<string, string[]> = {};
  const pagePaths = new Set(Object.keys(pages));
  const pathToPagePath: Record<string, string> = {};

  for (const pagePath of Object.keys(pages)) {
    const filename = pagePath.replace(/^wiki\//, "").replace(/\.md$/, "");
    pathToPagePath[filename] = pagePath;
    pathToPagePath[pagePath] = pagePath;
  }

  for (const [pagePath, page] of Object.entries(pages)) {
    const targets: string[] = [];
    for (const link of page.links) {
      const resolved = pathToPagePath[link];
      if (resolved && pagePaths.has(resolved)) {
        targets.push(resolved);
      } else if (link.startsWith("wiki/") && pagePaths.has(link)) {
        targets.push(link);
      }
    }
    graph[pagePath] = targets;
  }

  return graph;
}

function parseWikiPath(wikiPath: string): PageContent[] {
  const wikiDir = join(wikiPath, "wiki");
  const parsedPages: PageContent[] = [];

  try {
    const files = readDirRecursive(wikiDir, wikiDir);

    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      const frontmatter = extractFrontmatter(content);
      const relativePath = relative(wikiDir, file);

      const headings = extractHeadings(content);
      const firstParagraph = extractFirstParagraph(content);
      const body = extractBody(content);
      const links = extractWikilinks(content);

      const updated = frontmatter.updated || frontmatter.date || new Date().toISOString().split("T")[0];

      parsedPages.push({
        path: "wiki/" + relativePath.replace(/\\/g, "/"),
        title: extractTitle(content, frontmatter, file),
        headings,
        firstParagraph,
        body,
        updated,
        links,
      });
    }
  } catch (e) {
    console.error("Error parsing wiki:", e);
  }

  return parsedPages;
}

export function createIndexBuildTool() {
  return {
    name: "index_build",
    description:
      "Rebuild the search index after wiki changes. Parses all wiki pages, builds the wikilink graph, computes PageRank, and creates a BM25 term index. Run this after wiki-ingest or any bulk wiki changes.",
    inputSchema: {
      type: "object",
      properties: {
        wikiPath: {
          type: "string",
          description:
            "Absolute path to wiki root. Defaults to looking for .alexandria.json in home directory or current working directory.",
        },
      },
    },
    execute: async (args: IndexBuildParams) => {
      const wikiPath = getWikiPath(args.wikiPath);
      const outputPath = join(wikiPath, "search-index.json");

      const pages = parseWikiPath(wikiPath);
      const pageMap: Record<string, PageContent> = {};
      for (const page of pages) {
        pageMap[page.path] = page;
      }

      const graph = buildWikilinkGraph(pageMap);
      const pageRank = computePageRank(graph);
      const termIndex = buildTermIndex(pageMap);

      const index = {
        pages: pageMap,
        pageRank,
        termIndex,
        built: new Date().toISOString(),
      };

      writeFileSync(outputPath, JSON.stringify(index, null, 2));

      const result: IndexBuildResult = {
        status: "ok",
        pagesIndexed: pages.length,
        output: outputPath,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  };
}
