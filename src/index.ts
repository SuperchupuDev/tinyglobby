import { buildCrawler } from './crawler.ts';
import { getOptions } from './options.ts';
import { sortFiles } from './sort.ts';
import type { Crawler, GlobInput, GlobOptions, RelativeMapper } from './types.ts';
import { ensureStringArray, isReadonlyArray } from './utils.ts';

function formatPaths(paths: string[], mapper?: false | RelativeMapper) {
  if (mapper) {
    for (let i = paths.length - 1; i >= 0; i--) {
      paths[i] = mapper(paths[i]);
    }
  }
  return paths;
}

function getCrawler(
  globInput: GlobInput,
  inputOptions: GlobOptions = {}
): [] | [Crawler, false | RelativeMapper, GlobOptions, readonly string[]] {
  if (globInput && inputOptions?.patterns) {
    throw new Error('Cannot pass patterns as both an argument and an option');
  }

  const isModern = isReadonlyArray(globInput) || typeof globInput === 'string';
  // defaulting to ['**/*'] is tinyglobby exclusive behavior, deprecated
  const patterns = ensureStringArray((isModern ? globInput : globInput.patterns) ?? '**/*');
  const options = getOptions(isModern ? inputOptions : globInput);

  if (patterns.length === 0) {
    return [];
  }

  const [crawler, relative] = buildCrawler(options, patterns);
  return [crawler, relative, options, patterns];
}

function processResults(
  paths: string[],
  relative: false | RelativeMapper,
  options: GlobOptions,
  patterns: readonly string[]
): string[] {
  return sortFiles(formatPaths(paths, relative), patterns, options);
}

/**
 * Asynchronously match files following a glob pattern.
 * @see {@link https://superchupu.dev/tinyglobby/documentation#glob}
 */
export function glob(patterns: string | readonly string[], options?: Omit<GlobOptions, 'patterns'>): Promise<string[]>;
/**
 * @deprecated Provide patterns as the first argument instead.
 */
export function glob(options: GlobOptions): Promise<string[]>;
export async function glob(globInput: GlobInput, options?: GlobOptions): Promise<string[]> {
  const result = getCrawler(globInput, options);
  if (result.length === 0) {
    return [];
  }
  const [crawler, relative, opts, patterns] = result;
  return processResults(await crawler.withPromise(), relative, opts, patterns);
}

/**
 * Synchronously match files following a glob pattern.
 * @see {@link https://superchupu.dev/tinyglobby/documentation#globSync}
 */
export function globSync(patterns: string | readonly string[], options?: Omit<GlobOptions, 'patterns'>): string[];
/**
 * @deprecated Provide patterns as the first argument instead.
 */
export function globSync(options: GlobOptions): string[];
export function globSync(globInput: GlobInput, options?: GlobOptions): string[] {
  const result = getCrawler(globInput, options);
  if (result.length === 0) {
    return [];
  }
  const [crawler, relative, opts, patterns] = result;
  return processResults(crawler.sync(), relative, opts, patterns);
}

export { compileMatchers, sortFiles, sortFilesByPatternPrecedence } from './sort.ts';
export type { GlobOptions } from './types.ts';
export { convertPathToPattern, escapePath, isDynamicPattern } from './utils.ts';
