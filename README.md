# VL Patch Viewer

Visualize [vvvv gamma](https://vvvv.org) `.vl` patch files as interactive SVG
node graphs directly inside VS Code.

**Self-contained**: the VL parser and the SVG renderer are built into the
extension. No Python, no uv, no external tools — install and open a `.vl`
file.

Useful when you work with `.vl` files on a machine without vvvv installed
(e.g. reviewing patches on macOS/Linux), or when you simply prefer staying in
the editor.

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
- **Text ↔ graph duality** — the custom editor is a *text* editor underneath,
  so you can switch between "Text Editor" and "VL Patch Graph" any time;
  undo history and save behavior are unchanged.
- **Live refresh** — re-renders while you type (debounced), on save, and when
  the file changes on disk while clean (e.g. vvvv rewrote it).
- **Pan & zoom** — drag to pan, wheel to zoom around the cursor, toolbar for
  fit / 100%.
- **Pure TypeScript rendering** — parsed with an embedded XML parser and laid
  out with vvvv's own PinBarView geometry rules (port of
  [vl-patch-manipulator](https://github.com/tebjan/vvvv-skills), see
  [Credits](#credits--license)).

Deliberately out of scope for now (see [Roadmap](#roadmap)): drag-wiring,
region editing, runtime values.

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

## Known Limitations

- Whole-document rendering: a `.vl` file can contain many patches; the view
  shows all of them in one canvas. Per-canvas navigation is a Phase 2 item.
- Node labels may be truncated in the SVG at low zoom; zoom in to read them.
- Node semantics (pin types, overloads) live in .NET assemblies and are not
  available offline; the graph shows structure and saved values only.
- VL format evolves with vvvv versions; tested against vvvv gamma
  8.0-0184-era files. Files from much newer/older versions render best-effort.

## Roadmap

- **Phase 2 — light editing**: click a node to inspect/edit its inputs;
  insert nodes from a catalog; per-canvas views for multi-patch documents.
- **Phase 3 (maybe)**: live collaboration feedback with a running vvvv.

## Credits & License

- This extension is a **derivative work** of
  [vl-patch-manipulator](https://github.com/tebjan/vvvv-skills) by **tebjan**
  and the vvvv community. The VL parsing, geometry and SVG generation code was
  ported from it and reduced to the read-only rendering path.
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
# F5 → "Run Extension" launches the Extension Development Host
```

Lint with `npm run lint`, package with `npm run package` (produces a
`.vsix` you can install via *Extensions: Install from VSIX…*).
