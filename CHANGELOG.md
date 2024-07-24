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
