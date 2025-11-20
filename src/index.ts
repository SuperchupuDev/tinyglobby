import nativeFs from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCrawler } from './crawler.ts';
import type {
  Crawler,
  FileSystemAdapter,
  GlobInput,
  GlobOptions,
  InternalOptions,
  RelativeMapper
} from './types.ts';
import {
  BACKSLASHES,
  ensureStringArray,
  isReadonlyArray,
  log,
} from './utils.ts';

function formatPaths(paths: string[], mapper?: false | RelativeMapper) {
  if (mapper) {
    for (let i = paths.length - 1; i >= 0; i--) {
      paths[i] = mapper(paths[i]);
    }
  }
  return paths;
}

const fsKeys = ['readdir', 'readdirSync', 'realpath', 'realpathSync', 'stat', 'statSync'];

function normalizeFs(fs?: Record<string, unknown>): FileSystemAdapter | undefined {
  if (fs && fs !== nativeFs) {
    for (const key of fsKeys) {
      fs[key] = (fs[key] ? fs : (nativeFs as Record<string, unknown>))[key];
    }
  }
  return fs;
}

// Object containing all default options to ensure there is no hidden state difference
// between false and undefined.
const defaultOptions: GlobOptions = {
  caseSensitiveMatch: true,
  cwd: process.cwd(),
  debug: !!process.env.TINYGLOBBY_DEBUG,
  expandDirectories: true,
  followSymbolicLinks: true,
  onlyFiles: true
};

function getOptions(options?: GlobOptions): InternalOptions {
  const opts = { ...defaultOptions, ...options } as InternalOptions;

  opts.cwd = (opts.cwd instanceof URL ? fileURLToPath(opts.cwd) : resolve(opts.cwd)).replace(BACKSLASHES, '/');
  // Default value of [] will be inserted here if ignore is undefined
  opts.ignore = ensureStringArray(opts.ignore);
  opts.fs = normalizeFs(opts.fs);

  if (opts.debug) {
    log('globbing with options:', opts);
  }

  return opts;
}

function getCrawler(globInput: GlobInput, inputOptions: GlobOptions = {}): [] | [Crawler, false | RelativeMapper] {
  if (globInput && inputOptions?.patterns) {
    throw new Error('Cannot pass patterns as both an argument and an option');
  }

  const isModern = isReadonlyArray(globInput) || typeof globInput === 'string';
  // defaulting to ['**/*'] is tinyglobby exclusive behavior, deprecated
  const patterns = ensureStringArray((isModern ? globInput : globInput.patterns) ?? '**/*');
  const options = getOptions(isModern ? inputOptions : globInput);
  
  return patterns.length > 0 ? buildCrawler(options, patterns) : []
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
  const [crawler, relative] = getCrawler(globInput, options);
  return crawler ? formatPaths(await crawler.withPromise(), relative) : [];
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
  const [crawler, relative] = getCrawler(globInput, options);
  return crawler ? formatPaths(crawler.sync(), relative) : [];
}

export type { GlobOptions } from './types.ts';
export { convertPathToPattern, escapePath, isDynamicPattern } from './utils.ts';
