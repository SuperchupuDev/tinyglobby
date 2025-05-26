### [0.2.14](https://github.com/SuperchupuDev/tinyglobby/compare/0.2.13...0.2.14)

#### Fixed

- Root path joining on windows with help from [43081j](https://github.com/43081j) and [btea](https://github.com/btea)
- `deep: 0` is no longer mistakenly interpreted as not set
- Parent directories in patterns are now correctly normalized to `cwd`

#### Changed

- Switched bundler from [`tsup`](https://github.com/egoist/tsup) to [`tsdown`](https://github.com/rolldown/tsdown)

### [0.2.13](https://github.com/SuperchupuDev/tinyglobby/compare/0.2.12...0.2.13)

#### Fixed

- Performance of crawling `/` thanks to an upstream `fdir` fix by [pralkarz](https://github.com/pralkarz)
- Path joining when crawling from `/` by [benmccann](https://github.com/benmccann)
- Paths no longer have their first character removed in some cases when crawling from `/`
- Added compatibility with `@types/picomatch` 4.0.0

### [0.2.12](https://github.com/SuperchupuDev/tinyglobby/compare/0.2.11...0.2.12)

#### Fixed

- Using `..` inside ignore patterns could sometimes make the optimizer ignore parent directories

#### Changed

- The `debug` option now logs skipped directories

### [0.2.11](https://github.com/SuperchupuDev/tinyglobby/compare/0.2.10...0.2.11)

I've opened a sponsorships page! Consider sponsoring at https://github.com/sponsors/SuperchupuDev
if you'd like to support the development of this project. This is a huge release in a technical aspect
that took many months to get right.

#### Added

- New optimizer to avoid crawling directories with entries that will never match.

  This is a huge performance improvement and it should solve most if not all performance issues in the library.

  This has taken many months to figure out and implement and has gotten through three different implementations
  with the help and/or advice of many people, most from [e18e](https://e18e.dev):
  - [benmccann](https://github.com/benmcann)
  - [Fuzzyma](https://github.com/Fuzzyma)
  - [43081j](https://github.com/43081j)
  - [jviide](https://github.com/jviide)
  - [pralkarz](https://github.com/pralkarz)
  - [xiboon](https://github.com/xiboon)
  - [xuanduc987](https://github.com/xuanduc987)
  - [thecodrr](https://github.com/thecodrr) for merging a important upstream fix

- Other performance improvements, such as early returning without patterns by [bluwy](https://github.com/bluwy)
and micro-optimizations by [Torathion](https://github.com/Torathion)

- `debug` option. Useful for development purposes

#### Fixed

- Usage of escaped patterns with a cwd that partially matches the pattern
- Unsupported usages of backslashes making the library really slow. It should be way faster now thanks to the new optimizer

### [0.2.10](https://github.com/SuperchupuDev/tinyglobby/compare/0.2.9...0.2.10)

#### Added

- Re-enabled symlinks resolution. Big thanks to [thecodrr](https://github.com/thecodrr) for fixing the critical bug upstream

#### Fixed

- Processing of absolute negative patterns
- Negative `ignore` patterns are now not processed for consistency with `fast-glob`

### [0.2.9](https://github.com/SuperchupuDev/tinyglobby/compare/0.2.8...0.2.9)

#### Changed

- Temporarily reverted resolution of symbolic links due to a critical bug. See [#54](https://github.com/SuperchupuDev/tinyglobby/issues/54) for more info

### [0.2.8](https://github.com/SuperchupuDev/tinyglobby/compare/0.2.7...0.2.8)

#### Fixed

- Escaped symbols (i.e. `"\\["`) in the inferred common root producing empty matches

#### Changed

- Improved the common root inference algorithm to optimize non-trailing `**` patterns

### [0.2.7](https://github.com/SuperchupuDev/tinyglobby/compare/0.2.6...0.2.7)

#### Added

- Support for providing patterns as a string
- `followSymbolicLinks` option
- `escapePath` utility function by @benmccann
- `isDynamicPattern` utility function
- `convertPathToPattern` utility function

#### Fixed

- `.` as a pattern now works as expected
- Globbing no longer returns an empty string when matching the root directory
- Handling of escaped symbols in patterns

#### Changed

- Relicensed the project to the MIT license
- Disabled source maps on release builds for smaller bundle size
- Improved the common root inference algorithm

### [0.2.6](https://github.com/SuperchupuDev/tinyglobby/compare/0.2.5...0.2.6)

#### Added

- Full support for absolute paths as patterns
- `caseSensitiveMatch` option

### [0.2.5](https://github.com/SuperchupuDev/tinyglobby/compare/0.2.4...0.2.5)

#### Fixed

- Using a pattern that doesn't end with special characters with
`expandDirectories` disabled no longer produces incorrect matches

### [0.2.4](https://github.com/SuperchupuDev/tinyglobby/compare/0.2.3...0.2.4)

#### Fixed

- Using a pattern that can't infer a common root with `absolute` enabled no longer produces incorrect matches

### [0.2.3](https://github.com/SuperchupuDev/tinyglobby/compare/0.2.2...0.2.3)

#### Added

- Support for leading `../` in patterns

#### Changed

- A common root is now inferred from the patterns if possible to avoid unnecessary crawling

### [0.2.2](https://github.com/SuperchupuDev/tinyglobby/compare/0.2.1...0.2.2)

#### Added

- Basic handling of absolute patterns

#### Fixed

- Adding trailing slashes to the end of patterns no longer returns incorrect results
- Matching directories without `expandDirectories` without a trailing slash now works correctly

### [0.2.1](https://github.com/SuperchupuDev/tinyglobby/compare/0.2.0...0.2.1)

#### Fixed

- Using an empty array of `patterns` no longer acts as `['**/*']`

#### Changed

- Windows now uses forward slashes instead of backslashes
- Modified `ignore` behavior to vastly improve performance when ignoring whole directories

## [0.2.0](https://github.com/SuperchupuDev/tinyglobby/compare/0.1.2...0.2.0)

#### BREAKING CHANGES

The library no longer sets `dot` to `true` internally by default. It now defaults it to `false`, just like `globby` and `fast-glob`.

You can configure this by using the new `dot` option.

#### Added

- Support for specifying the `patterns` option as the first argument to better approach a drop-in `globby` replacement

```js
await glob(['src/*.ts'], { ignore: ['_secret'] });

// you can still specify it in the options object
await glob({ patterns: ['src/*.ts'], ignore: ['_secret'] });
```

- Support for non-absolute paths in `cwd`
- `dot` option
- `deep` option
- `onlyFiles` option

### [0.1.2](https://github.com/SuperchupuDev/tinyglobby/compare/0.1.1...0.1.2)

#### Added

- `onlyDirectories` option

### [0.1.1](https://github.com/SuperchupuDev/tinyglobby/compare/0.1.0...0.1.1)

#### Added

- `ignore` option
- `expandDirectories` option
