import { type ExcludePredicate, type FSLike, fdir } from 'fdir';
import picomatch, { type PicomatchOptions } from 'picomatch';
import processPatterns from './patterns.ts';
import type { Crawler, InternalOptions, InternalProps, PartialMatcher, RelativeMapper } from './types.ts';
import { BACKSLASHES, buildFormat, buildRelative, getPartialMatcher, log, ONLY_PARENT_DIRECTORIES } from './utils.ts';

const LEADING_PARENT_DIRECTORIES = /^(?:\.\.\/)+/;

function buildIgnoreMatcher(patterns: string[], options: PicomatchOptions, outsideCwd: boolean): PartialMatcher {
  if (!outsideCwd || options.noglobstar) {
    return picomatch(patterns, options);
  }

  const globstarPatterns: string[] = [];
  const otherPatterns: string[] = [];
  for (const pattern of patterns) {
    if (pattern.startsWith('**')) {
      globstarPatterns.push(pattern);
    } else {
      otherPatterns.push(pattern);
    }
  }

  if (globstarPatterns.length === 0) {
    return picomatch(otherPatterns, options);
  }

  const globstarMatcher = picomatch(globstarPatterns, options);
  const matchGlobstar: PartialMatcher = input =>
    !ONLY_PARENT_DIRECTORIES.test(input) &&
    globstarMatcher(input.startsWith('../') ? input.replace(LEADING_PARENT_DIRECTORIES, '') : input);

  if (otherPatterns.length === 0) {
    return matchGlobstar;
  }

  const otherMatcher = picomatch(otherPatterns, options);
  return input => otherMatcher(input) || matchGlobstar(input);
}

export function buildCrawler(options: InternalOptions, patterns: readonly string[]): [Crawler, false | RelativeMapper] {
  const cwd = options.cwd as string;
  const props: InternalProps = { root: cwd, depthOffset: 0 };
  const processed = processPatterns(options, patterns, props);

  if (options.debug) {
    log('internal processing patterns:', processed);
  }

  const { absolute, caseSensitiveMatch, debug, dot, followSymbolicLinks, onlyDirectories } = options;
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

  const matcher = picomatch(processed.match, matchOptions);
  const ignore = buildIgnoreMatcher(processed.ignore, matchOptions, props.depthOffset < 0);
  const partialMatcher = getPartialMatcher(processed.match, matchOptions);

  const format = buildFormat(cwd, root, absolute);
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
            const matches = matcher(path) && !ignore(path);

            if (matches) {
              log(`matched ${path}`);
            }

            return matches;
          }
        : (p, isDirectory) => {
            const path = format(p, isDirectory);
            return matcher(path) && !ignore(path);
          }
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

  return [crawler, cwd !== root && !absolute && buildRelative(cwd, root)];
}
// #endregion buildCrawler
