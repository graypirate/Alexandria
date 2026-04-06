import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";
import type { DetectedFile, DetectResult } from "../types.js";
import { getWikiPath } from "../utils.js";

interface DetectParams {
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
      } else if (entry.isFile()) {
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

function guessType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  const name = filename.toLowerCase();

  if ([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"].includes(ext)) return "image";
  if ([".mp4", ".mov", ".avi", ".mkv"].includes(ext)) return "video";
  if ([".mp3", ".wav", ".m4a", ".flac"].includes(ext)) return "audio";
  if (ext === ".pdf") return "pdf";
  if (name.includes("chat-export") || name.includes("conversation")) return "chat-export";
  if (name.includes("tweet") || name.includes("twitter")) return "tweet";
  if (name.includes("github") || name.includes("repo")) return "repo";
  if (ext === ".md") return "article";
  return "document";
}

function getWikiFiles(wikiPath: string): Set<string> {
  const wikiDir = join(wikiPath, "wiki");
  const files = readDirRecursive(wikiDir);
  const processedSources = new Set<string>();

  for (const file of files) {
    if (extname(file) !== ".md") continue;
    try {
      const content = readFileSync(file, "utf-8");
      const fm = extractFrontmatter(content);
      if (fm.sources) {
        const sources = fm.sources
          .replace(/[\[\]]/g, "")
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""));
        for (const source of sources) {
          if (source) processedSources.add(source);
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  return processedSources;
}

export function createDetectNewTool() {
  return {
    name: "detect_new",
    description:
      "Detect unprocessed files in the wiki's raw/ directory. Returns list of new files not yet referenced by any wiki page's sources field, plus list of already-processed files. Use this before wiki-ingest to see what new sources need processing.",
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
    execute: async (args: DetectParams) => {
      const wikiPath = getWikiPath(args.wikiPath);
      const rawDir = join(wikiPath, "raw");
      const rawFiles = readDirRecursive(rawDir);
      const processedSources = getWikiFiles(wikiPath);

      const newFiles: DetectedFile[] = [];
      const alreadyProcessed: string[] = [];

      for (const file of rawFiles) {
        const relPath = relative(wikiPath, file).replace(/\\/g, "/");
        const stats = statSync(file);
        const name = relPath.split("/").pop() || relPath;

        const detected: DetectedFile = {
          path: relPath,
          name,
          type: guessType(name),
          frontmatter: {},
          size: stats.size,
          modified: stats.mtime.toISOString().split("T")[0],
        };

        if (extname(file) === ".md") {
          try {
            const content = readFileSync(file, "utf-8");
            detected.frontmatter = extractFrontmatter(content);
          } catch {
            // Skip unreadable files
          }
        }

        if (processedSources.has(relPath)) {
          alreadyProcessed.push(relPath);
        } else {
          newFiles.push(detected);
        }
      }

      const result: DetectResult = {
        newFiles,
        alreadyProcessed,
        totalRaw: rawFiles.length,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  };
}
