import { posix } from 'node:path';
import { fdir, type PathsOutput } from 'fdir';
import type { APIBuilder } from 'fdir/dist/builder/api-builder';
import picomatch from "picomatch";
import type { GlobOptions, InternalProps, PartialMatcherOptions, ProcessedPatterns } from "./types.ts";
import { getPartialMatcher, log } from "./utils.ts";

// #region getRelativePath
// TODO: this is slow, find a better way to do this
export function getRelativePath(path: string, cwd: string, root: string): string {
  return posix.relative(cwd, `${root}/${path}`) || '.';
}
// #endregion

// #region processPath
function processPath(path: string, cwd: string, root: string, isDirectory: boolean, absolute?: boolean) {
  const relativePath = absolute ? path.slice(root.length + 1) || '.' : path;

  if (root === cwd) {
    return isDirectory && relativePath !== '.' ? relativePath.slice(0, -1) : relativePath;
  }

  return getRelativePath(relativePath, cwd, root);
}
// #endregion processPath

// #region formatPaths
export function formatPaths(paths: string[], cwd: string, root: string): string[] {
  for (let i = paths.length - 1; i >= 0; i--) {
    const path = paths[i];
    paths[i] = getRelativePath(path, cwd, root) + (!path || path.endsWith('/') ? '/' : '');
  }
  return paths;
}
// #endregion formatPaths

// #region buildFdir
export function buildFdir(options: GlobOptions, props: InternalProps, processed: ProcessedPatterns, cwd: string, root: string): APIBuilder<PathsOutput> {
  const { absolute, debug, followSymbolicLinks, onlyDirectories } = options
  const nocase = !options.caseSensitiveMatch;

  const matcher = picomatch(processed.match, {
    dot: options.dot,
    nocase,
    ignore: processed.ignore
  });

  const partialMatcherOptions: PartialMatcherOptions = { dot: options.dot, nocase };
  const ignore = picomatch(processed.ignore, partialMatcherOptions);
  const partialMatcher = getPartialMatcher(processed.match, partialMatcherOptions);

  return new fdir({
    filters: [(p, isDirectory) => {
      const path = processPath(p, cwd, root, isDirectory, absolute);
      const matches = matcher(path);
      if (debug && matches) {
        log(`matched ${path}`);
      }
      return matches;
    }],
    exclude: (_, p) => {
      const relativePath = processPath(p, cwd, root, true, true);
      const skipped = (relativePath !== '.' && !partialMatcher(relativePath)) || ignore(relativePath);
      if (debug) {
        log(`${skipped ? 'skipped' : 'crawling'} ${p}`);
      }
      return skipped;
    },
    pathSeparator: '/',
    relativePaths: !absolute,
    resolvePaths: absolute,
    includeBasePath: absolute,
    resolveSymlinks: followSymbolicLinks,
    excludeSymlinks: !followSymbolicLinks,
    excludeFiles: onlyDirectories,
    includeDirs: onlyDirectories || !options.onlyFiles,
    maxDepth: options.deep && Math.round(options.deep - props.depthOffset)
  }).crawl(root);
}
// #endregion buildFdir
