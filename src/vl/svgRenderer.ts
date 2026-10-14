// Whole-document SVG preview — a TypeScript port of spatial.py's
// render_svg / _visible_elements / layout_analysis from vl-patch-manipulator.
import { XmlElement, attr, childElements } from './xml';
import { VlGraph } from './graph';
import {
  AnchorContext,
  Rect,
  dataHubLabel,
  dataHubRectangle,
  elementRectangle,
  ellipsize,
  endpointAnchor,
  escapeXml,
  formatG,
  parseBounds,
  rectanglesOverlap,
  segmentsCross,
} from './geometry';

const STYLE = [
  'text{font-family:Segoe UI,Arial,sans-serif}',
  '.label{font-size:10px;fill:#eee}',
  '.small{font-size:8px;fill:#bbb}',
  '.node{fill:#3b3d42;stroke:#8c9099;stroke-width:1}',
  '.pad{fill:#4a4d53;stroke:#9da2ac}',
  '.comment{fill:#25272b;stroke:#d0a64b}',
  '.region{fill:#202226;fill-opacity:.24;stroke:#59616d;stroke-width:1.5}',
  '.link{stroke:#7f8792;stroke-width:1;fill:none}',
  '.feedback{stroke:#8fb5c2;stroke-dasharray:4 3}',
  '.up{stroke:#ff4b4b;stroke-width:2}',
  '.pin{fill:#d0d4db}',
].join('');

interface VisibleElement {
  element: XmlElement;
  kind: string;
  label: string;
  bounds: Rect;
}

const KIND_ORDER: Record<string, number> = {
  region: 0,
  heading: 1,
  comment: 2,
  link: 3,
  pad: 4,
  node: 5,
};

export function renderSvg(graph: VlGraph): string {
  const context: AnchorContext = { graph };
  const elements = visibleElements(context);
  if (elements.length === 0) {
    throw new Error('This .vl document contains no renderable patch content.');
  }
  const left = Math.min(...elements.map((item) => item.bounds[0])) - 30;
  const top = Math.min(...elements.map((item) => item.bounds[1])) - 30;
  const right = Math.max(...elements.map((item) => item.bounds[0] + item.bounds[2])) + 30;
  const bottom = Math.max(...elements.map((item) => item.bounds[1] + item.bounds[3])) + 30;
  const width = right - left;
  const height = bottom - top;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${formatG(left)} ${formatG(top)} ${formatG(width)} ${formatG(height)}" width="${formatG(width)}" height="${formatG(height)}">`,
    `<style>${STYLE}</style>`,
    `<rect x="${formatG(left)}" y="${formatG(top)}" width="${formatG(width)}" height="${formatG(height)}" fill="#17181b"/>`,
  ];

  for (const { kind, label, bounds } of elements) {
    if (kind !== 'region') {
      continue;
    }
    const [x, y, w, h] = bounds;
    parts.push(`<rect class="region" x="${formatG(x)}" y="${formatG(y)}" width="${formatG(w)}" height="${formatG(h)}" rx="4"/>`);
    parts.push(`<text class="small" x="${formatG(x + 8)}" y="${formatG(y + 13)}">${escapeXml(label)}</text>`);
  }

  for (const link of graph.links) {
    const endpoints = VlGraph.linkEndpoints(link);
    if (!endpoints) {
      continue;
    }
    const source = endpointAnchor(context, endpoints[0], true);
    const target = endpointAnchor(context, endpoints[1], false);
    if (!source || !target) {
      continue;
    }
    const feedback = VlGraph.isFeedback(link);
    const css = feedback ? 'link feedback' : target[1] <= source[1] ? 'up' : 'link';
    const title = feedback
      ? '<title>Compiler feedback marker (not an automatic delay)</title>'
      : '';
    parts.push(
      `<path class="${css}" d="M ${formatG(source[0])} ${formatG(source[1])} L ${formatG(target[0])} ${formatG(target[1])}">${title}</path>`
    );
  }

  for (const { element, kind, label, bounds } of elements) {
    if (kind === 'region') {
      continue;
    }
    const [x, y, w, h] = bounds;
    if (kind === 'slot' || kind === 'control_point') {
      const stored = parseBounds(attr(element, 'Bounds'))!;
      const centerX = stored[0] + 0.5;
      const centerY = stored[1] - 0.5;
      if (kind === 'slot') {
        parts.push(`<circle class="pad" cx="${formatG(centerX)}" cy="${formatG(centerY)}" r="4.5"/>`);
      } else {
        parts.push(
          `<rect class="pad" x="${formatG(centerX - 4.5)}" y="${formatG(centerY - 4.5)}" width="9" height="9"/>`
        );
      }
      if (label) {
        parts.push(`<text class="label" x="${formatG(centerX + 6.5)}" y="${formatG(centerY + 3)}">${escapeXml(label)}</text>`);
      }
      continue;
    }
    const css = kind === 'node' ? 'node' : kind === 'pad' ? 'pad' : 'comment';
    parts.push(`<rect class="${css}" x="${formatG(x)}" y="${formatG(y)}" width="${formatG(w)}" height="${formatG(h)}" rx="2"/>`);
    const textY = y + Math.min(h - 4, 13);
    parts.push(
      `<text class="label" x="${formatG(x + 5)}" y="${formatG(textY)}">${escapeXml(ellipsize(label, Math.max(8, Math.floor(w / 6))))}</text>`
    );
    if (kind === 'node') {
      for (const pin of childElements(element, 'Pin')) {
        const id = attr(pin, 'Id');
        if (!id) {
          continue;
        }
        const anchor = endpointAnchor(context, id);
        if (anchor) {
          parts.push(`<circle class="pin" cx="${formatG(anchor[0])}" cy="${formatG(anchor[1])}" r="1.8"/>`);
        }
      }
    }
  }

  const analysis = layoutAnalysis(context);
  parts.push(
    `<text class="small" x="${formatG(left + 8)}" y="${formatG(bottom - 8)}">overlaps ${analysis.overlaps} · upward ${analysis.upward} · crossings ${analysis.crossings}</text>`
  );
  parts.push('</svg>');
  return parts.join('\n');
}

function visibleElements(context: AnchorContext): VisibleElement[] {
  const { graph } = context;
  const annotationIds = new Set(graph.annotations().map((element) => attr(element, 'Id')));
  const elements: VisibleElement[] = [];
  for (const node of graph.operationalNodes()) {
    const bounds = elementRectangle(node);
    if (bounds) {
      elements.push({ element: node, kind: 'node', label: VlGraph.nodeName(node), bounds });
    }
  }
  for (const pad of graph.pads) {
    const stored = parseBounds(attr(pad, 'Bounds'));
    const isSlot =
      !!attr(pad, 'SlotId') && stored !== undefined && stored.length === 2;
    const bounds = isSlot ? dataHubRectangle(context, pad) : bounds4(pad);
    if (!bounds) {
      continue;
    }
    let kind: string;
    let label: string;
    if (isSlot) {
      kind = 'slot';
      label = dataHubLabel(context, pad);
    } else if (annotationIds.has(attr(pad, 'Id'))) {
      kind = graph.annotationKind(pad);
      label = attr(pad, 'Value') ?? '';
    } else {
      kind = 'pad';
      label = attr(pad, 'Comment') ?? attr(pad, 'Value') ?? 'Value';
    }
    elements.push({ element: pad, kind, label, bounds });
  }
  for (const portal of graph.controlPoints) {
    const label = dataHubLabel(context, portal);
    if (!label && !['Top', 'Bottom'].includes(attr(portal, 'Alignment') ?? '')) {
      continue;
    }
    const bounds = dataHubRectangle(context, portal);
    if (bounds) {
      elements.push({ element: portal, kind: 'control_point', label, bounds });
    }
  }
  for (const overlay of graph.overlays) {
    const bounds = bounds4(overlay);
    if (bounds) {
      elements.push({ element: overlay, kind: 'region', label: attr(overlay, 'Name') ?? '', bounds });
    }
  }
  elements.sort((a, b) => {
    if (a.bounds[1] !== b.bounds[1]) {
      return a.bounds[1] - b.bounds[1];
    }
    if (a.bounds[0] !== b.bounds[0]) {
      return a.bounds[0] - b.bounds[0];
    }
    return (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9);
  });
  return elements;
}

function bounds4(element: XmlElement): Rect | undefined {
  const values = parseBounds(attr(element, 'Bounds'));
  if (!values || values.length < 4) {
    return undefined;
  }
  return [values[0], values[1], values[2], values[3]];
}

/** Footer statistics: pairwise overlaps, upward links, link crossings. */
function layoutAnalysis(context: AnchorContext): { overlaps: number; upward: number; crossings: number } {
  const { graph } = context;
  const annotationIds = new Set(graph.annotations().map((element) => attr(element, 'Id')));
  const rectangles: Rect[] = [];
  for (const node of graph.operationalNodes()) {
    const rectangle = elementRectangle(node);
    if (rectangle) {
      rectangles.push(rectangle);
    }
  }
  for (const pad of graph.pads) {
    if (annotationIds.has(attr(pad, 'Id')) || (graph.outgoing.get(attr(pad, 'Id') ?? '')?.size ?? 0) === 0) {
      continue;
    }
    const bounds = parseBounds(attr(pad, 'Bounds'));
    const rectangle =
      bounds && bounds.length === 2 ? dataHubRectangle(context, pad) : elementRectangle(pad);
    if (rectangle) {
      rectangles.push(rectangle);
    }
  }

  let overlaps = 0;
  for (let i = 0; i < rectangles.length; i++) {
    for (let j = i + 1; j < rectangles.length; j++) {
      if (rectanglesOverlap(rectangles[i], rectangles[j])) {
        overlaps++;
      }
    }
  }

  interface Segment {
    source: string;
    target: string;
    from: [number, number];
    to: [number, number];
  }
  const segments: Segment[] = [];
  let upward = 0;
  for (const link of graph.links) {
    const endpoints = VlGraph.linkEndpoints(link);
    if (!endpoints) {
      continue;
    }
    const sourceAnchor = endpointAnchor(context, endpoints[0], true);
    const targetAnchor = endpointAnchor(context, endpoints[1], false);
    const sourceOwner = graph.endpointOwner.get(endpoints[0]);
    const targetOwner = graph.endpointOwner.get(endpoints[1]);
    if (!sourceAnchor || !targetAnchor || !sourceOwner || !targetOwner) {
      continue;
    }
    if (graph.isRegionFeedback(link)) {
      continue;
    }
    if (targetAnchor[1] <= sourceAnchor[1]) {
      upward++;
    }
    segments.push({
      source: endpoints[0],
      target: endpoints[1],
      from: sourceAnchor,
      to: targetAnchor,
    });
  }

  let crossings = 0;
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const first = segments[i];
      const second = segments[j];
      // Ignore only a genuine shared endpoint/junction.
      if (
        first.source === second.source ||
        first.source === second.target ||
        first.target === second.source ||
        first.target === second.target
      ) {
        continue;
      }
      if (segmentsCross(first.from, first.to, second.from, second.to)) {
        crossings++;
      }
    }
  }
  return { overlaps, upward, crossings };
}
