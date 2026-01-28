import { type ExcludePredicate, type FSLike, fdir } from 'fdir';
import picomatch, { type PicomatchOptions } from 'picomatch';
import processPatterns from './patterns.ts';
import type { Crawler, CrawlerInfo, InternalOptions, InternalProps, RelativeMapper } from './types.ts';
import { BACKSLASHES, buildFormat, buildRelative, getPartialMatcher, log } from './utils.ts';

// #region buildCrawlerInfo
export function buildCrawlerInfo(options: InternalOptions, patterns: readonly string[]): CrawlerInfo {
  const cwd = options.cwd as string;
  const props: InternalProps = { root: cwd, depthOffset: 0 };
  const processed = processPatterns(options, patterns, props);

  if (options.debug) {
    log('internal processing patterns:', processed);
  }

  const { absolute, caseSensitiveMatch, dot } = options;
  const root = props.root.replace(BACKSLASHES, '');
  // For some of these options, false and undefined are two different states!
  const matchOptions = {
    dot,
    nobrace: options.braceExpansion === false,
    nocase: !caseSensitiveMatch,
    noextglob: options.extglob === false,
    noglobstar: options.globstar === false,
    posix: true
  } satisfies PicomatchOptions;

  const format = buildFormat(cwd, root, absolute);

  return { processed, matchOptions, cwd, root, absolute, props, format, patterns };
}
// #endregion buildCrawlerInfo

// #region buildCrawler
export function buildCrawler(
  options: InternalOptions,
  patterns: readonly string[]
): [Crawler, false | RelativeMapper, CrawlerInfo] {
  const info = buildCrawlerInfo(options, patterns);
  const { processed, matchOptions, cwd, root, absolute, props, format } = info;
  const { debug, followSymbolicLinks, onlyDirectories } = options;

  const matcher = picomatch(processed.match, { ...matchOptions, ignore: processed.ignore });
  const ignore = picomatch(processed.ignore, matchOptions);
  const partialMatcher = getPartialMatcher(processed.match, matchOptions);

  const excludeFormatter = absolute ? format : buildFormat(cwd, root, true);

  const excludePredicate: ExcludePredicate = (_, p): boolean => {
    const relativePath = excludeFormatter(p, true);
    return (relativePath !== '.' && !partialMatcher(relativePath)) || ignore(relativePath);
  };

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

  return [crawler, cwd !== root && !absolute && buildRelative(cwd, root), info];
}
// #endregion buildCrawler
