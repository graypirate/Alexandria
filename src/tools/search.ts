import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { SearchResult, SearchIndex, PageContent } from "../types.js";
import { getWikiPath } from "../utils.js";
import { buildIndex } from "./index-build.js";

interface SearchParams {
  query: string;
  wikiPath?: string;
  limit?: number;
}

const ALPHA = 0.3;

function loadSearchIndex(wikiPath: string): SearchIndex | null {
  try {
    const indexPath = join(wikiPath, "search-index.json");
    return JSON.parse(readFileSync(indexPath, "utf-8"));
  } catch {
    return null;
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function bm25(
  query: string,
  page: PageContent,
  termIndex: Record<string, Record<string, number>>,
  avgdl: number,
  totalDocs: number
): number {
  const terms = tokenize(query);
  let score = 0;
  const k1 = 1.5;
  const b = 0.75;

  for (const term of terms) {
    const pageFreqs = termIndex[term];
    if (!pageFreqs) continue;

    const tf = pageFreqs[page.path] || 0;
    const df = Object.keys(pageFreqs).length;
    const n = totalDocs || 1;

    const idf = Math.log((n - df + 0.5) / (df + 0.5) + 1);
    const docLen = page.body.split(/\s+/).length;

    score +=
      idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * docLen / avgdl)));
  }

  return score;
}

function getSnippet(content: string, query: string, maxLen = 200): string {
  const terms = tokenize(query);
  const sentences = content.split(/[.!?]+/);

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (terms.some((term) => lower.includes(term))) {
      return sentence.trim().slice(0, maxLen) + (sentence.length > maxLen ? "..." : "");
    }
  }

  return content.slice(0, maxLen) + (content.length > maxLen ? "..." : "");
}

function search(query: string, index: SearchIndex, limit: number): SearchResult[] {
  const pages = index.pages;
  const totalDocs = Object.keys(pages).length;

  if (totalDocs === 0) return [];

  const avgdl = Object.values(pages).reduce(
    (sum, p) => sum + p.body.split(/\s+/).length,
    0
  ) / totalDocs;

  const results: SearchResult[] = [];

  for (const [path, page] of Object.entries(pages)) {
    let bm25Score = 0;

    const titleTerms = tokenize(page.title);
    const headingTerms = page.headings.flatMap(tokenize);
    const firstParaTerms = tokenize(page.firstParagraph);

    const terms = tokenize(query);
    const titleMatch = terms.filter((t) => titleTerms.includes(t)).length;
    const headingMatch = terms.filter((t) => headingTerms.includes(t)).length;
    const firstParaMatch = terms.filter((t) => firstParaTerms.includes(t)).length;

    const structuralBoost = titleMatch * 10 + headingMatch * 5 + firstParaMatch * 3;

    bm25Score = bm25(query, page, index.termIndex, avgdl, totalDocs) + structuralBoost;

    const prScore = index.pageRank[path] || 0;
    const finalScore = bm25Score * (1 + ALPHA * prScore);

    if (finalScore > 0) {
      results.push({
        path,
        title: page.title,
        snippet: getSnippet(page.firstParagraph || page.body, query),
        score: finalScore,
        updated: page.updated,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

function getRecentLogEntries(wikiPath: string, limit = 5): string[] {
  try {
    const logPath = join(wikiPath, "log.md");
    const content = readFileSync(logPath, "utf-8");
    const entries = content.match(/^## \[\d{4}-\d{2}-\d{2}\].+$/gm) || [];
    return entries.slice(0, limit);
  } catch {
    return [];
  }
}

export function createSearchTool() {
  return {
    name: "search",
    description:
      "Search the user's persistent wiki knowledge base. Call this BEFORE answering any question that references past work, named projects, prior decisions, ongoing ideas, or topics the user treats as already-known. The wiki is the source of truth across sessions; conversation memory is not — do not answer from memory when the wiki might know. Returns ranked pages (BM25 + PageRank) with snippets plus the most recent activity log entries. Read the top 2-4 hits in full before responding. Do not announce that you searched — integrate the knowledge naturally into your answer.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search query. Include specific terms, names, or phrases to find relevant wiki pages.",
        },
        wikiPath: {
          type: "string",
          description:
            "Absolute path to wiki root. Defaults to looking for .alexandria.json in home directory or current working directory.",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return. Defaults to 10.",
          default: 10,
        },
      },
      required: ["query"],
    },
    execute: async (args: SearchParams) => {
      const wikiPath = getWikiPath(args.wikiPath);
      const limit = args.limit || 10;

      let index = loadSearchIndex(wikiPath);

      if (!index) {
        try {
          const built = buildIndex(wikiPath);
          index = built.index;
        } catch (e) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  results: [],
                  error: `Could not build search index at ${wikiPath}: ${e instanceof Error ? e.message : String(e)}`,
                }),
              },
            ],
          };
        }
      }

      if (!args.query) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                results: [],
                error: "No query provided",
              }),
            },
          ],
        };
      }

      const results = search(args.query, index, limit);
      const recentLog = getRecentLogEntries(wikiPath);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                results,
                recentLog,
                query: args.query,
              },
              null,
              2
            ),
          },
        ],
      };
    },
  };
}
