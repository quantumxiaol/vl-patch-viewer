// Self-contained VL → SVG renderer. The VL parser, vvvv editor geometry and
// SVG generator are ported from vl-patch-manipulator into this extension, so
// no external tool, Python runtime or MCP server is required.
import { CanvasInfo, VlGraph } from './vl/graph';
import { renderSvg } from './vl/svgRenderer';
import { parseXml } from './vl/xml';

export interface RenderResult {
  /** SVG markup (without XML prolog) ready to inline into the webview. */
  svg: string;
  canvases: CanvasInfo[];
  selectedCanvasId: string | null;
}

export interface VlRenderer {
  render(sourceText: string, canvasId?: string | null): RenderResult;
}

export class BuiltinRenderer implements VlRenderer {
  public render(sourceText: string, canvasId?: string | null): RenderResult {
    const root = parseXml(sourceText);
    const graph = new VlGraph(root);
    const canvases = graph.canvases();
    const requested = canvasId === undefined ? graph.defaultCanvasId() : canvasId;
    const selectedCanvasId: string | null = requested === null
      ? null
      : typeof requested === 'string' && canvases.some((canvas) => canvas.id === requested)
        ? requested
        : graph.defaultCanvasId() ?? null;
    return {
      svg: renderSvg(graph, graph.canvasScope(selectedCanvasId)),
      canvases,
      selectedCanvasId,
    };
  }
}
