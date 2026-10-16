---
name: vl-patch-authoring
description: "Use VL Patch Viewer in VS Code to inspect, safely edit, and validate .vl documents with static and vvvvc diagnostics."
license: CC-BY-SA-4.0
metadata:
  author: quantumxiaol and vvvv-skills contributors
  version: "1.0"
  source: tebjan/vvvv-skills @ 565bc5013e661f4d029d81417ddb2045dd1f629a
---

# VL Patch Authoring in VS Code

Use the extension's built-in commands and diagnostics. Do **not** run the Python `vl-patch-manipulator` or expect a `vlpatch` CLI or MCP server to be installed.

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

## Boundaries

- Do not use this extension to evaluate runtime values, infer types, or prove that a patch compiles or behaves correctly.
- Do not insert/delete nodes, rewire links, search catalogs, move nodes, or invoke a runtime bridge unless the user explicitly provides those capabilities.
- Treat unsupported nested defaults, slots, semantic node types, and adaptive overloads as read-only. Unknown values are rejected instead of guessed.
- A successful structural edit is not a compiler or runtime guarantee. When vvvv is available, perform the real vvvvc validation as well.

## Reference material

The sibling directories contain the original vvvv-skills documents for file format, patching, channels, custom nodes, debugging, .NET, editor extensions, fundamentals, node libraries, shaders, spreads, startup, testing, and troubleshooting. Use them for domain knowledge, not as proof that a generated edit is valid.
