---
name: vl-patch-authoring
description: "Use VL Patch Viewer in VS Code to inspect, safely edit, and validate .vl documents with static and vvvvc diagnostics."
license: CC-BY-SA-4.0
metadata:
  author: quantumxiaol and vvvv-skills contributors
  version: "1.0"
  source: tebjan/vvvv-skills @ 1c6768473a6aa45487a33674cbe08b67b6a6a0f3
---

# VL Patch Authoring in VS Code

Use the extension's built-in commands and diagnostics first. The bundled workspace package also includes the optional `vl-patch-manipulator` source for advanced typed edits, catalogs, layout and MCP/CLI workflows. Do not assume Python or uv is installed.

## Available commands

- Open a `.vl` file with **VL Patch Graph** to inspect structure, links, pads, and saved values.
- Use the **Canvas** selector to choose a Process scope or **Whole document**.
- Click a node or IOBox for details and saved static values. Double-click to zoom.
- Change an input Pin's direct `DefaultValue` or a non-Slot Pad's `Value` and select **Apply**. Nested `DefaultValue` elements and Slot pads are read-only.
- Run **VL Patch: Validate with vvvv** on Windows when a local vvvv compiler is available, or enable `vlPatch.validateOnSave`.
- Run **VL Patch: Install skills** (`vlPatch.installSkills`) to copy these documents into a workspace without overwriting existing files.

## Editing and validation loop

1. Read the current document and preserve its order, IDs, unknown properties, namespaces, and established geometry. Make only the requested minimal change.
2. Never reuse IDs or invent nodes, pins, types, or references. New structure must come from a verified donor or from existing document data.
3. Change only static saved values supported by the extension. Structural validation runs before each edit and the extension does not save on your behalf.
4. Save the file, then inspect **Problems**. `vl-structure` diagnostics report XML/ID/link/scope invariants; `vvvvc` diagnostics report real compiler errors when vvvv is installed.
5. Fix the reported issues and validate again. Do not claim a file is valid until the diagnostics you own are cleared or explained.

## Optional manipulator

For operations outside the extension—catalog lookup, node/link insertion, annotations, layout, slots, builders, or typed batch edits—use the workspace copy at `.agents/skills/vvvv-fileformat/scripts/vl-patch-manipulator` only when Python ≥3.11 and uv are available. Do not run it automatically; use it only when the user asks for an advanced operation or the current task cannot be completed safely with the extension.

```powershell
cd .agents/skills/vvvv-fileformat/scripts/vl-patch-manipulator
uv sync --extra server --group test
uv run vlpatch --help
uv run --extra server vlpatch-server
```

Use the manipulator's typed operations and validation instead of rewriting XML by hand. Its edits still flow through VS Code's file watcher, so the extension refreshes Problems after the file changes.

## Boundaries

- Do not use this extension to evaluate runtime values, infer types, or prove that a patch compiles or behaves correctly.
- Do not insert/delete nodes, rewire links, search catalogs, move nodes, or invoke a runtime bridge with the extension alone. For those operations, use the optional manipulator's typed commands and validation when available.
- Treat unsupported nested defaults, slots, semantic node types, and adaptive overloads as read-only. Unknown values are rejected instead of guessed.
- A successful structural edit is not a compiler or runtime guarantee. When vvvv is available, perform the real vvvvc validation as well.

## Reference material

The sibling directories contain the original vvvv-skills documents for file format, patching, channels, custom nodes, debugging, .NET, editor extensions, fundamentals, node libraries, shaders, spreads, startup, testing, and troubleshooting. Use them for domain knowledge, not as proof that a generated edit is valid.
