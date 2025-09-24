import nativeFs from 'node:fs';
import { posix } from 'node:path';
import { type Options as FdirOptions, fdir, type PathsOutput, type ExcludePredicate, type FSLike } from 'fdir';
import picomatch, { type Matcher, type PicomatchOptions } from 'picomatch';
import type {
  APIBuilder,
  GlobCrawler,
  GlobOptions,
  InternalProps,
  PartialMatcher,
  PartialMatcherOptions,
  PredicateFormatter,
  ProcessedPatterns
} from './types.ts';
import { buildFormat, buildRelative, getPartialMatcher, log } from './utils.ts';

const BACKSLASHES = /\\/g;

// #region getRelativePath
// TODO: this is slow, find a better way to do this
export function getRelativePath(path: string, cwd: string, root: string): string {
  return posix.relative(cwd, `${root}/${path}`) || '.';
}
// #endregion

// #region processPath
function processPath(path: string, cwd: string, root: string, isDirectory: boolean, absolute?: boolean) {
  const relativePath = absolute ? path.slice(root === '/' ? 1 : root.length + 1) || '.' : path;

  if (root === cwd) {
    return isDirectory && relativePath !== '.' ? relativePath.slice(0, -1) : relativePath;
  }

  return getRelativePath(relativePath, cwd, root);
}
// #endregion processPath

function buildExcludePredicate(formatter: PredicateFormatter, partialMatcher: PartialMatcher, ignore: Matcher): ExcludePredicate {
  return  (_, p) => {
    const relativePath = formatter(p, true);
    return (relativePath !== '.' && !partialMatcher(relativePath)) || ignore(relativePath);
  }
}

// #region buildFdir
export function buildFDir(props: InternalProps, options: GlobOptions, processed: ProcessedPatterns, cwd: string): GlobCrawler {
  const { absolute, caseSensitiveMatch, debug, dot, followSymbolicLinks, onlyDirectories } = options

  // For these options, false and undefined are two different states!
  const matchOptions = {
    dot,
    nobrace: options.braceExpansion === false,
    nocase: !caseSensitiveMatch,
    noextglob: options.extglob === false,
    noglobstar: options.globstar === false,
    posix: true
  } satisfies PicomatchOptions;

  const matcher = picomatch(processed.match, { ...matchOptions, ignore: processed.ignore });
  const ignore = picomatch(processed.ignore, matchOptions);
  const partialMatcher = getPartialMatcher(processed.match, matchOptions);

  const format = buildFormat(cwd, props.root, options.absolute);
  const excludePredicate = buildExcludePredicate(options.absolute ? format : buildFormat(cwd, props.root, true), partialMatcher, ignore);

  props.root = props.root.replace(BACKSLASHES, '');
  const root = props.root;

  let maxDepth: number | undefined;
  if (options.deep !== undefined) {
    maxDepth = Math.round(options.deep - props.depthOffset);
  }

  const crawler = new fdir({
    // use relative paths in the matcher
    filters: [
      options.debug
        ? (p, isDirectory) => {
            const path = format(p, isDirectory);
            const matches = matcher(path);

            if (matches) {
              log(`matched ${path}`);
            }

            return matches;
          }
        : (p, isDirectory) => matcher(format(p, isDirectory))
    ],
    exclude: options.debug
      ? (_, p) => {
          const skipped = excludePredicate(_, p)
          log(`${skipped ? 'skipped' : 'crawling'} ${p}`)
          return skipped;
        }
      : excludePredicate,
    fs: options.fs as FSLike,
    pathSeparator: '/',
    relativePaths: !absolute,
    resolvePaths: absolute,
    includeBasePath: absolute,
    resolveSymlinks: followSymbolicLinks,
    excludeSymlinks: !followSymbolicLinks,
    excludeFiles: onlyDirectories,
    includeDirs: onlyDirectories || !options.onlyFiles,
    maxDepth,
    signal: options.signal
  }).crawl(root);

  if (options.debug) {
    log('internal properties:', props);
  }

  return { crawler, relative: cwd !== root && !options.absolute && buildRelative(cwd, root)  };
}
// #endregion buildFdir
