import { posix } from 'node:path';
import { type ExcludePredicate, type FSLike, fdir } from 'fdir';
import picomatch, { type PicomatchOptions } from 'picomatch';
import processPatterns from './patterns.ts';
import type { Crawler, InternalOptions, InternalProps, PartialMatcher, RelativeMapper } from './types.ts';
import { BACKSLASHES, buildFormat, buildRelative, getPartialMatcher, log } from './utils.ts';

function getStaticMatchers(patterns: string[]): [PartialMatcher, PartialMatcher] {
  const matches = new Set(patterns);
  const prefixes = new Set<string>();
  for (const pattern of patterns) {
    let prefix = pattern;
    while (prefix !== '.' && prefix !== '/') {
      prefixes.add(prefix);
      prefix = posix.dirname(prefix);
    }
  }
  return [path => matches.has(path), path => prefixes.has(path)];
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

  const dynamicMatcher = picomatch(processed.match, matchOptions) as PartialMatcher;
  const dynamicPartialMatcher = getPartialMatcher(processed.match, matchOptions);
  let matcher = dynamicMatcher;
  let partialMatcher = dynamicPartialMatcher;
  if (processed.static.length > 0) {
    const [staticMatcher, staticPartialMatcher] = getStaticMatchers(processed.static);
    if (processed.match.length > 0) {
      matcher = path => staticMatcher(path) || dynamicMatcher(path);
      partialMatcher = path => staticPartialMatcher(path) || dynamicPartialMatcher(path);
    } else {
      matcher = staticMatcher;
      partialMatcher = staticPartialMatcher;
    }
  }
  const ignore = picomatch(processed.ignore, matchOptions);

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
