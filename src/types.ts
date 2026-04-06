export interface SearchResult {
  path: string;
  title: string;
  snippet: string;
  score: number;
  updated: string;
}

export interface SearchResponse {
  results: SearchResult[];
  recentLog: string[];
  query: string;
  error?: string;
}

export interface PageContent {
  path: string;
  title: string;
  headings: string[];
  firstParagraph: string;
  body: string;
  updated: string;
  links: string[];
}

export interface LintResult {
  orphans: string[];
  brokenLinks: Array<{ page: string; link: string; target: string }>;
  missingFrontmatter: Array<{ page: string; missing: string[] }>;
  notInIndex: string[];
  stale: Array<{ page: string; lastUpdated: string }>;
  unlinkedSources: string[];
}

export interface DetectedFile {
  path: string;
  name: string;
  type: string;
  frontmatter: Record<string, string>;
  size: number;
  modified: string;
}

export interface DetectResult {
  newFiles: DetectedFile[];
  alreadyProcessed: string[];
  totalRaw: number;
}

export interface ScaffoldConfig {
  wikiPath: string;
  wikiName: string;
  focusFolders: string[];
  created: string;
  version: string;
}

export interface IndexBuildResult {
  status: string;
  pagesIndexed: number;
  output: string;
}

export interface SearchIndex {
  pages: Record<string, PageContent>;
  pageRank: Record<string, number>;
  termIndex: Record<string, Record<string, number>>;
  built: string;
}

export interface AlexandriaConfig {
  wikiPath: string;
  wikiName?: string;
  focusFolders?: string[];
  created?: string;
  version?: string;
  lint?: {
    staleDays?: number;
    autoFixBrokenLinks?: boolean;
    autoAddToIndex?: boolean;
  };
}
