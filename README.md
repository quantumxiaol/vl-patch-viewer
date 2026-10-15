# VL Patch Viewer

[中文说明](README_ZH.md)

![VL Patch Viewer icon](images/icon.png)

Visualize [vvvv gamma](https://vvvv.org) `.vl` patch files as interactive SVG
node graphs directly inside VS Code.

**Self-contained**: the VL parser and the SVG renderer are built into the
extension. No Python, no uv, no external tools — install and open a `.vl` file.
You can review patches and their saved parameters on Windows, macOS, or Linux,
even when vvvv is not installed.

## Installation

Download the latest `vl-patch-viewer-x.y.z.vsix` file from
[GitHub Releases](https://github.com/quantumxiaol/vl-patch-viewer/releases).
In VS Code, open the Extensions view, select *…* → *Install from VSIX…*, and
choose the downloaded file. Reload VS Code if prompted. A Marketplace account
or publisher ID is not required.

You can also install it from a terminal:

```sh
code --install-extension vl-patch-viewer-x.y.z.vsix
```

## Features

- **Graph view for `.vl` files** — open any `.vl` file with the
  *VL Patch Graph* custom editor to see the patch rendered as an SVG node
  graph (nodes, pins, links, regions, IOBoxes, comments).
- **Per-canvas views** — switch between discovered Process canvases or inspect
  the whole document. Executable regions stay in scope; independent definitions
  are excluded from the selected canvas.
- **Node and IOBox details** — click an element to inspect its category, bounds,
  pins, and saved values; double-click to zoom to it.
- **Static saved-value editing** — change an input Pin's `DefaultValue` or an
  IOBox's `Value` through a typed, validated edit. Unknown elements and unsafe
  targets are refused.
- **Text ↔ graph duality** — the custom editor is a *text* editor underneath,
  so edits use VS Code's native undo, dirty-state, and save behavior.
- **Live refresh** — re-renders while you type (debounced), on save, and when
  the file changes on disk while clean (e.g. vvvv rewrote it).
- **Pan & zoom** — drag to pan, wheel to zoom around the cursor, toolbar for
  fit / 100%.
- **Pure TypeScript rendering** — parsed with an embedded XML parser and laid
  out with vvvv's own PinBarView geometry rules (port of
  [vl-patch-manipulator](https://github.com/tebjan/vvvv-skills), see
  [Credits](#credits--license)).

Deliberately out of scope for now: node insertion/deletion, drag-wiring,
catalog search, runtime values, and live vvvv compilation.

## Usage

1. Open the folder containing your `.vl` files in VS Code.
2. Right-click a `.vl` file in the Explorer and select *Open With…* →
   **VL Patch Graph**. The extension parses the file and displays its SVG graph.
3. If the plain text editor opens instead, run *View: Reopen Editor With…*
   from the Command Palette and select **VL Patch Graph**.

To make **VL Patch Graph** the default editor for all `.vl` files, add this to
your VS Code user settings:

```json
"workbench.editorAssociations": {
  "*.vl": "vlPatch.viewer"
}
```

Switch back at any time via *Open vl with…* → *Text Editor*. No renderer
configuration is needed.

### Inspect and edit saved values

1. Select a Process canvas from the **Canvas** dropdown, or choose
   **Whole document**.
2. Click a node or IOBox to open its details. Double-click an element to zoom
   to it.
3. Edit a supported `DefaultValue` or `Value` and select **Apply**. Structural
   validation runs before the edit is accepted.
4. Use `Ctrl+Z` to undo and `Ctrl+S` to save. The extension does not save or
   rewrite the rest of the document for you.

Only direct input-pin defaults and non-Slot Pad values are editable. Nested
`DefaultValue` elements and Slot pads are read-only.

## Known Limitations

- Static validation checks XML structure, IDs, links, and related invariants;
  it cannot prove that a value has the correct runtime type or that vvvv will
  compile the patch. Runtime values and type inference are not available.
- Node labels may be truncated in the SVG at low zoom; zoom in to read them.
- Node semantics (pin types, overloads) live in .NET assemblies and are not
  available offline; the graph shows structure and saved values only.
- VL format evolves with vvvv versions; tested against vvvv gamma
  8.0-0184-era files. Files from much newer/older versions render best-effort.

## Roadmap

- **Phase 2 — current**: per-canvas views, element details, and static
  saved-value editing.
- **Later**: donor-based node insertion and additional layout operations.
- **Phase 3 (maybe)**: live collaboration feedback with a running vvvv.

## Credits & License

- This extension is a **derivative work** of
  [vl-patch-manipulator](https://github.com/tebjan/vvvv-skills) by **tebjan**
  and the vvvv community. The VL parsing, geometry and SVG generation code was
  ported from it and reduced to the rendering and static XML editing path.
- Licensed under **CC BY-SA 4.0** (same as the upstream work) — see
  [LICENSE](https://github.com/quantumxiaol/vl-patch-viewer/blob/HEAD/LICENSE) for the full legal text and attribution notice.
- [vvvv](https://vvvv.org) / VL format by the vvvv group.
- Bundled runtime dependency: [@xmldom/xmldom](https://github.com/xmldom/xmldom)
  (MIT).

## Contributing

Issues and PRs welcome. Development setup:

```sh
npm install
npm run compile   # or: npm run watch
npm test          # compile and run the unit tests
# F5 → Run Extension launches the Extension Development Host
```

Lint with `npm run lint`, package with `npm run package` (produces a
`.vsix` you can install via *Extensions: Install from VSIX…*). See
[CONTRIBUTING.md](CONTRIBUTING.md) for the full development guide and [中文说明](README_ZH.md) for the Chinese README.
