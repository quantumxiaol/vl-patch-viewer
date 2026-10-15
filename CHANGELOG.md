# Changelog

## [0.2.0] - 2026-10-15

### Added
- Per-canvas Process views with a Whole document fallback and executable-region scoping.
- Node and IOBox details, including saved pin defaults, categories, and bounds.
- Static editing for input Pin DefaultValue and non-Slot Pad Value through VS Code's native undo and text-document model.
- Offline structural validation before edits, plus scoped rendering and edit regression tests.
- Regression coverage from five additional MIT-licensed VL packages, with pinned provenance and license texts.
- Extension icon and bilingual English/Chinese README files and Marketplace description.

## [0.1.0] - 2026-10-14

### Added
- Custom text editor for `.vl` files rendering interactive SVG node graphs.
- Self-contained VL XML parser, vvvv editor geometry, and SVG generator ported
  to pure TypeScript; no Python, external CLI, or subprocess is required.
- Pan/zoom controls and live refresh on typing, save, and external file changes.
- Renderer unit tests covering correctness, determinism, UTF-8 BOM handling,
  and invalid input, with CI on Windows, macOS, and Linux.
- CC BY-SA 4.0 license and attribution for the upstream vl-patch-manipulator
  work; `@xmldom/xmldom` is bundled as the only runtime dependency.
