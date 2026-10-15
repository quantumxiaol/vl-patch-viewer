# Contributing

Issues and pull requests are welcome. By contributing, you agree that your
contributions are provided under the project's CC BY-SA 4.0 license.

## Development setup

Use Node.js 20 and a VS Code version compatible with `engines.vscode` in
`package.json`.

```sh
npm install
npm run compile
npm run lint
npm test
```

`npm test` compiles the extension and runs the Mocha unit tests from
`out/test/`. During development, `npm run watch` recompiles on changes.

Press **F5** in VS Code and select **Run Extension** to open an Extension
Development Host. The default build task starts the TypeScript watcher before
launching. Open a `.vl` file with **VL Patch Graph** to exercise the custom
editor.

## Project layout

- `src/` — extension and renderer TypeScript sources.
- `src/test/**/*.test.ts` — Mocha unit tests, compiled to `out/test/`.
- `media/` — static webview assets shipped with the extension.
- `test/fixtures/` — small, redistributable test inputs and their provenance.
- `out/` — generated JavaScript; do not edit or commit it.

Add renderer tests under `src/test/` and keep test data out of `src/`. Large VL
corpora should stay local rather than being committed. Every third-party
fixture must be small enough for Git, compatible with redistribution, and
documented in `test/fixtures/PROVENANCE.md` with its source and license.

The project currently uses lightweight unit tests only. If VS Code integration
tests are added later, follow the official `@vscode/test-electron` layout rather
than mixing the downloaded VS Code instances into the repository.

## Before submitting a pull request

Run the same checks as CI:

```sh
npm run compile
npm run lint
npm test
```

CI runs these checks on Windows, macOS, and Linux. Keep user-facing changes in
`CHANGELOG.md`, follow semantic versioning for releases, and do not commit
`out/`, `node_modules/`, or generated `.vsix` files.

## Optional real compiler verification (Windows)

The cross-platform unit tests do not require vvvv and must remain the default
for every contributor. On a Windows machine with vvvv installed, also use the
Extension Development Host to run **VL Patch: Validate with vvvv** on a known
valid document and on a document with a deliberately broken node reference.
Check that success is reported, compilation errors appear in Problems, and no
temporary build output is left behind. Real vvvv validation is optional and is
not required to reproduce or review ordinary changes.

## License and third-party material

The extension is a derivative work and is licensed under **CC BY-SA 4.0**.
Contributions, forks, and adaptations must retain the attribution and
share-alike requirements of that license; a fork cannot relicense the derived
work under an incompatible license.

Third-party fixtures remain under their own licenses. For example, the bundled
VL.Bunraku help patches are MIT-licensed and are excluded from the packaged
extension. Do not remove or obscure their provenance.

## Releasing through GitHub Releases

The `version` field in `package.json` is the single source of truth for VS Code,
the generated VSIX, and release assets. It is separate from `engines.vscode`,
which declares VS Code compatibility. Use semantic versioning: **patch** for
fixes and small adjustments, **minor** for backward-compatible features, and
**major** for incompatible changes. During the `0.x` phase, the API is still
considered unstable.

Before a routine release, commit the intended changes and add a matching
`CHANGELOG.md` section. Then let npm update the manifest and lockfile, create
the release commit, and create the corresponding Git tag:

```sh
npm version patch   # or: npm version minor / major
npm run package     # optional local packaging check
git push --follow-tags
```

Pushing a `v*` tag runs `.github/workflows/release.yml`. The workflow verifies
that the tag matches `package.json`, runs all checks, builds the VSIX, and
creates a GitHub Release with the VSIX attached. No Marketplace account or
publisher ID is needed for this distribution method.

Published versions and tags should only move forward and must correspond to
their CHANGELOG sections; Marketplace also rejects duplicate versions. Resetting
an unpublished development version is different: use an explicit version with
`npm version <version> --no-git-tag-version` to avoid creating a release commit
or tag.

## Optional Marketplace publishing

Marketplace publishing is not required for GitHub Releases. If it is added
later, replace the development `publisher` value in `package.json` with the real
Marketplace publisher ID, add a 128×128 icon and reference it from the manifest,
and verify the README and its screenshots. Run all checks, inspect the
file list with `npx vsce ls`, and create the package with `npm run package`.
