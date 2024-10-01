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
