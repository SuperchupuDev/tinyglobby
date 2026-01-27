import nativeFs from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FileSystemAdapter, GlobOptions, InternalOptions } from './types.ts';
import { BACKSLASHES, ensureStringArray, log } from './utils.ts';

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

export function getOptions(options?: GlobOptions): InternalOptions {
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
