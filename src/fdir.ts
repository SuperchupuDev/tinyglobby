import { posix } from 'node:path';
import { type ExcludePredicate, type FSLike, fdir } from 'fdir';
import picomatch, { type Matcher, type PicomatchOptions } from 'picomatch';
import type {
  GlobCrawler,
  GlobOptions,
  InternalProps,
  PartialMatcher,
  PredicateFormatter,
  ProcessedPatterns
} from './types.ts';
import { BACKSLASHES, buildFormat, buildRelative, getPartialMatcher, log } from './utils.ts';

// #region getRelativePath
// TODO: this is slow, find a better way to do this
export function getRelativePath(path: string, cwd: string, root: string): string {
  return posix.relative(cwd, `${root}/${path}`) || '.';
}
// #endregion

// #region buildExcludePredicate
function buildExcludePredicate(
  formatter: PredicateFormatter,
  partialMatcher: PartialMatcher,
  ignore: Matcher
): ExcludePredicate {
  return (_, p) => {
    const relativePath = formatter(p, true);
    return (relativePath !== '.' && !partialMatcher(relativePath)) || ignore(relativePath);
  };
}
// #endregion buildExcludePredicate

// #region buildFdir
export function buildFDir(
  props: InternalProps,
  options: GlobOptions,
  processed: ProcessedPatterns,
  cwd: string
): GlobCrawler {
  const { absolute, caseSensitiveMatch, debug, dot, followSymbolicLinks, onlyDirectories } = options;
  const root = props.root.replace(BACKSLASHES, '')
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

  const format = buildFormat(cwd, root, absolute);
  const excludePredicate = buildExcludePredicate(
    options.absolute ? format : buildFormat(cwd, root, true),
    partialMatcher,
    ignore
  );


  let maxDepth: number | undefined;
  if (options.deep !== undefined) {
    maxDepth = Math.round(options.deep - props.depthOffset);
  }

  const crawler = new fdir({
    // use relative paths in the matcher
    filters: [
      debug
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
    exclude: debug
      ? (_, p) => {
          const skipped = excludePredicate(_, p);
          log(`${skipped ? 'skipped' : 'crawling'} ${p}`);
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
    log('internal properties:', { ...props, root });
  }

  return { crawler, relative: cwd !== root && !absolute && buildRelative(cwd, root) };
}
// #endregion buildFdir
