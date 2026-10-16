# Working with VL Patch Viewer

This workspace includes **VL Patch Viewer** and its bundled vvvv-skills documentation. Use the extension for inspection, static editing, and diagnostics instead of looking for a Python CLI or MCP server.

## Workflow

1. Inspect the document with **VL Patch Graph**. Select a Process canvas or **Whole document**, then inspect nodes and IOBoxes before changing anything.
2. Preserve existing IDs, declaration order, unknown XML properties, namespaces, and geometry. Do not invent node types, overloads, pins, or references.
3. Only change an input Pin's direct `DefaultValue` or a non-Slot Pad's `Value`. Nested `DefaultValue` and Slot pads are read-only.
4. Apply small, typed edits and save. The extension validates the target instead of serializing the whole document.
5. Read **Problems**:
   - `vl-structure` reports structural XML problems such as duplicate IDs and dangling or reversed links.
   - `vvvvc` reports actual compiler failures when vvvv is installed on Windows.
6. Fix and validate again. Do not report completion while diagnostics you own remain unresolved.

## Hard boundaries

- Do not use runtime values, type inference, or compilation claims that are not evidenced by the current document and compiler output.
- Do not insert/delete nodes, rewire links, move nodes, or use catalogs without a verified source. Use existing document donors when adding structure later.
- Do not run the generated application, install packages, or alter user files outside the requested edit.
- If vvvv is unavailable, only claim structural validation. If vvvvc is available, also run the real compiler validation.

See `assets/vvvv-skills/` in the extension installation for vvvv-specific reference material, and `assets/vvvv-skills/vl-patch-authoring/SKILL.md` for the bridge workflow.
