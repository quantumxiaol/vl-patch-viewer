// vvvv editor geometry — a TypeScript port of the rendering-relevant parts
// of vl-patch-manipulator's session.py (_element_rectangle, _endpoint_anchor,
// _intrinsic_node_width, _data_hub_*). Constants mirror vvvv's own
// PinBarView metrics (NodePinSize.Width == 5, MinPinGap == 15).
import { XmlElement, attr, childElement, childElements } from './xml';
import { VlGraph } from './graph';

export type Rect = [number, number, number, number]; // x, y, width, height

/** Parse a Bounds attribute: "x,y" or "x,y,w,h" (commas or spaces). */
export function parseBounds(value: string | undefined): number[] | undefined {
  if (!value) {
    return undefined;
  }
  const parts = value.split(/[\s,]+/).filter((part) => part.length > 0);
  if (parts.length < 2) {
    return undefined;
  }
  const numbers = parts.map(Number);
  return numbers.every((n) => isFinite(n)) ? numbers : undefined;
}

export function isVisibleInput(pin: XmlElement): boolean {
  const kind = attr(pin, 'Kind');
  return (
    (kind === 'InputPin' || kind === 'StateInputPin' || kind === 'ApplyPin' || kind === 'ControlPoint') &&
    (attr(pin, 'IsHidden') ?? 'false').toLowerCase() !== 'true'
  );
}

export function isVisibleOutput(pin: XmlElement): boolean {
  const kind = attr(pin, 'Kind');
  return (
    (kind === 'OutputPin' || kind === 'StateOutputPin') &&
    (attr(pin, 'IsHidden') ?? 'false').toLowerCase() !== 'true'
  );
}

/**
 * Estimate vvvv's compact node width from title and visible pin rails.
 * Pin rail width is 5*P + 15*(P-1), with P the larger visible rail.
 * A stored wider Bounds value stays authoritative (manual stretch).
 */
export function intrinsicNodeWidth(element: XmlElement): number {
  const titleWidth = 12.0 + VlGraph.nodeName(element).length * 5.2;
  const pins = childElements(element, 'Pin');
  const visibleInputs = pins.filter(isVisibleInput).length;
  const visibleOutputs = pins.filter(isVisibleOutput).length;
  const pinCount = Math.max(visibleInputs, visibleOutputs);
  const pinWidth = 5.0 * pinCount + 15.0 * Math.max(0, pinCount - 1);
  return Math.max(25.0, titleWidth, pinWidth);
}

/** Element rectangle in canvas coordinates; nodes expand to intrinsic width. */
export function elementRectangle(element: XmlElement): Rect | undefined {
  const bounds = parseBounds(attr(element, 'Bounds'));
  if (!bounds) {
    return undefined;
  }
  const tag = element.nodeName;
  if (bounds.length === 2 && (tag === 'Pad' || tag === 'ControlPoint')) {
    const [x, y] = bounds;
    return [x - 4, y - 5, 9, 9];
  }
  if (bounds.length < 4) {
    return undefined;
  }
  const [x, y, width, height] = bounds;
  const local = tag.includes(':') ? tag.slice(tag.indexOf(':') + 1) : tag;
  if (local === 'Node') {
    return [x, y, Math.max(width, intrinsicNodeWidth(element)), height];
  }
  return [x, y, width, height];
}

export interface AnchorContext {
  graph: VlGraph;
}

/**
 * Exact link anchor for an endpoint.
 * - Pads/ControlPoints: connector body via DataHubView.GetLinkAnchorPosition
 *   (PadOffset=(.5,-.5), half of the 9px body height).
 * - Nodes: PinBarView layout — one pin left-aligned, two or more stretch
 *   across the complete effective node width.
 */
export function endpointAnchor(
  context: AnchorContext,
  endpointId: string,
  asSource?: boolean
): [number, number] | undefined {
  const owner = context.graph.endpointOwner.get(endpointId);
  if (!owner) {
    return undefined;
  }
  const ownerTag = owner.nodeName;
  if (ownerTag === 'Pad' || ownerTag === 'ControlPoint') {
    const bounds = parseBounds(attr(owner, 'Bounds'));
    if (!bounds || bounds.length < 2) {
      return undefined;
    }
    const [x, y] = bounds;
    const isSource = asSource ?? (context.graph.outgoing.get(endpointId)?.size ?? 0) > 0;
    return [x + 0.5, y + (isSource ? 4.0 : -5.0)];
  }
  const rectangle = elementRectangle(owner);
  if (!rectangle) {
    return undefined;
  }
  const [x, y, storedWidth, height] = rectangle;
  const endpoint = context.graph.byId.get(endpointId);
  if (!endpoint) {
    return undefined;
  }
  const width = Math.max(storedWidth, intrinsicNodeWidth(owner));
  const pins = childElements(owner, 'Pin');
  const inputPin = isVisibleInput(endpoint);
  const rail = pins.filter(inputPin ? isVisibleInput : isVisibleOutput);
  if (!rail.includes(endpoint) || rail.length === 0) {
    return [x + 2.5, y + (inputPin ? 0 : height)];
  }
  const index = rail.indexOf(endpoint);
  // Exact PinBarView layout: one pin is left-aligned; two or more stretch
  // from the left edge to the right edge across the complete node width.
  // Python's round() (ported faithfully) is banker's rounding: halves go to
  // the nearest even integer.
  const pinX =
    rail.length === 1
      ? 0.0
      : roundHalfToEven((index * (width - 5.0)) / (rail.length - 1));
  return [x + pinX + 2.5, y + (inputPin ? 0 : height)];
}

/** Connector body plus an approximate font-sized label envelope. */
export function dataHubRectangle(context: AnchorContext, element: XmlElement): Rect | undefined {
  const rectangle = elementRectangle(element);
  if (!rectangle) {
    return undefined;
  }
  const label = dataHubLabel(context, element);
  const [x, y, width, height] = rectangle;
  if (!label) {
    return rectangle;
  }
  // ControlPointView places its label at body-right + LabelOffset=2.
  return [x, y - 2, width + 2 + label.length * 5.2, height + 4];
}

export function dataHubLabel(context: AnchorContext, element: XmlElement): string {
  if (element.nodeName === 'Pad') {
    const slotId = attr(element, 'SlotId');
    if (slotId) {
      const slot = context.graph.byId.get(slotId);
      return slot ? attr(slot, 'Name') ?? '' : '';
    }
  }
  if (element.nodeName === 'ControlPoint') {
    const identifier = attr(element, 'Id');
    for (const link of context.graph.links) {
      const endpoints = VlGraph.linkEndpoints(link);
      if (
        (attr(link, 'IsHidden') ?? 'false').toLowerCase() !== 'true' ||
        !endpoints ||
        !endpoints.includes(identifier ?? '')
      ) {
        continue;
      }
      const other = context.graph.byId.get(
        endpoints[0] === identifier ? endpoints[1] : endpoints[0]
      );
      if (other) {
        const name = attr(other, 'Name');
        if (name) {
          return name;
        }
      }
    }
  }
  return attr(element, 'Name') ?? attr(element, 'Comment') ?? '';
}

/** Python round(): banker's rounding (halves to the nearest even integer). */
export function roundHalfToEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff < 0.5) {
    return floor;
  }
  if (diff > 0.5) {
    return floor + 1;
  }
  return floor % 2 === 0 ? floor : floor + 1;
}

export function rectanglesOverlap(left: Rect, right: Rect): boolean {
  const [lx, ly, lw, lh] = left;
  const [rx, ry, rw, rh] = right;
  return lx < rx + rw && rx < lx + lw && ly < ry + rh && ry < ly + lh;
}

export function segmentsCross(
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number]
): boolean {
  const orientation = (
    p: [number, number],
    q: [number, number],
    r: [number, number]
  ): number =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0;
}

/** Python's "{:g}"-style number formatting for SVG attributes. */
export function formatG(value: number): string {
  if (Number.isInteger(value) && Math.abs(value) < 1e15) {
    return String(value);
  }
  return String(Number(value.toPrecision(6)));
}

/** Flatten whitespace and ellipsize, matching spatial.py _ellipsize. */
export function ellipsize(value: string, limit: number): string {
  const flattened = value.split(/\s+/).filter((part) => part.length > 0).join(' ');
  return flattened.length <= limit
    ? flattened
    : flattened.slice(0, Math.max(1, limit - 1)) + '…';
}

/** Minimal XML escaping for text nodes (labels). */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export { childElement };
