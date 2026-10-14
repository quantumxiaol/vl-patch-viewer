// Self-contained VL → SVG renderer. The VL parser, vvvv editor geometry and
// SVG generator are ported from vl-patch-manipulator into this extension, so
// no external tool, Python runtime or MCP server is required.
import { VlGraph } from './vl/graph';
import { renderSvg } from './vl/svgRenderer';
import { parseXml } from './vl/xml';

export interface RenderResult {
  /** SVG markup (without XML prolog) ready to inline into the webview. */
  svg: string;
}

export interface VlRenderer {
  render(sourceText: string): RenderResult;
}

export class BuiltinRenderer implements VlRenderer {
  public render(sourceText: string): RenderResult {
    const root = parseXml(sourceText);
    const graph = new VlGraph(root);
    return { svg: renderSvg(graph) };
  }
}
