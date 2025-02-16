export interface GlobOptions {
  absolute?: boolean;
  cwd?: string;
  patterns?: string | string[];
  ignore?: string | string[];
  dot?: boolean;
  deep?: number;
  followSymbolicLinks?: boolean;
  caseSensitiveMatch?: boolean;
  expandDirectories?: boolean;
  onlyDirectories?: boolean;
  onlyFiles?: boolean;
  debug?: boolean;
}

export interface InternalProps {
  root: string;
  commonPath: string[] | null;
  depthOffset: number;
}

export interface ProcessedPatterns {
    match: string[];
    ignore: string[];
}

export interface PartialMatcherOptions {
  dot?: boolean;
  nocase?: boolean;
}
