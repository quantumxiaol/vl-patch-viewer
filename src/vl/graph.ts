// Indexed view over a parsed VL document — a TypeScript port of the
// VlGraph class from vl-patch-manipulator (document.py). The read-only
// queries needed for rendering and inspection are ported.
import {
  XmlElement,
  attr,
  childElement,
  childElements,
  childText,
  localName,
} from './xml';

export interface CanvasInfo {
  id: string;
  name: string;
  patchId: string;
  definitionId?: string;
  isApplication: boolean;
}

/** Undefined means the whole document; a set limits content to one canvas. */
export type CanvasScope = Set<XmlElement> | undefined;

export class VlGraph {
  public readonly byId = new Map<string, XmlElement>();
  public readonly elements: XmlElement[] = [];
  public readonly nodes: XmlElement[] = [];
  public readonly pads: XmlElement[] = [];
  public readonly links: XmlElement[] = [];
  public readonly overlays: XmlElement[] = [];
  public readonly controlPoints: XmlElement[] = [];
  public readonly endpointOwner = new Map<string, XmlElement>();
  /** Pin kinds; pads are bidirectional (null) and resolved per link. */
  public readonly endpointKind = new Map<string, string | null>();
  public readonly outgoing = new Map<string, Set<string>>();
  public readonly incoming = new Map<string, Set<string>>();
  private readonly parentOf = new Map<XmlElement, XmlElement>();

  public constructor(public readonly root: XmlElement) {
    this.index();
  }

  private index(): void {
    // Document-order traversal (Python's root.iter() equivalent): children
    // are pushed in reverse so the LIFO stack pops them in original order.
    const ordered: XmlElement[] = [];
    const stack: XmlElement[] = [this.root];
    while (stack.length > 0) {
      const element = stack.pop()!;
      ordered.push(element);
      const children: XmlElement[] = [];
      for (let child = element.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 1) {
          children.push(child as XmlElement);
        }
      }
      for (let i = children.length - 1; i >= 0; i--) {
        this.parentOf.set(children[i], element);
        stack.push(children[i]);
      }
    }
    for (const element of ordered) {
      this.elements.push(element);
      const id = attr(element, 'Id');
      if (id && !this.byId.has(id)) {
        this.byId.set(id, element);
      }
      const name = localName(element);
      if (name === 'Node') {
        this.nodes.push(element);
      } else if (name === 'Pad') {
        this.pads.push(element);
      } else if (name === 'Link') {
        this.links.push(element);
      } else if (name === 'Overlay') {
        this.overlays.push(element);
      } else if (name === 'ControlPoint') {
        this.controlPoints.push(element);
      }
    }
    for (const node of this.nodes) {
      for (const pin of childElements(node, 'Pin')) {
        const id = attr(pin, 'Id');
        if (id) {
          this.endpointOwner.set(id, node);
          this.endpointKind.set(id, attr(pin, 'Kind') ?? null);
        }
      }
    }
    for (const pad of this.pads) {
      const id = attr(pad, 'Id');
      if (id) {
        this.endpointOwner.set(id, pad);
        this.endpointKind.set(id, null);
      }
    }
    for (const controlPoint of this.controlPoints) {
      const id = attr(controlPoint, 'Id');
      if (id) {
        this.endpointOwner.set(id, controlPoint);
        this.endpointKind.set(id, 'ControlPoint');
      }
    }
    for (const link of this.links) {
      const endpoints = VlGraph.linkEndpoints(link);
      if (!endpoints) {
        continue;
      }
      const [source, target] = endpoints;
      if (!this.outgoing.has(source)) {
        this.outgoing.set(source, new Set());
      }
      this.outgoing.get(source)!.add(target);
      if (!this.incoming.has(target)) {
        this.incoming.set(target, new Set());
      }
      this.incoming.get(target)!.add(source);
    }
  }

  public parent(element: XmlElement): XmlElement | undefined {
    return this.parentOf.get(element);
  }

  /** Visible canvas annotations: Comment/Link string IOBoxes plus Overlays. */
  public annotations(): XmlElement[] {
    const result: XmlElement[] = [];
    for (const pad of this.pads) {
      const style = VlGraph.annotationStyle(pad);
      if (style === 'Comment' || style === 'Link') {
        result.push(pad);
      }
    }
    result.push(...this.overlays);
    return result;
  }

  public annotationKind(element: XmlElement): string {
    if (localName(element) === 'Overlay') {
      return 'region';
    }
    const style = VlGraph.annotationStyle(element);
    const settings = childElement(element, 'ValueBoxSettings');
    const fontSize = settings ? childText(settings, 'fontsize') : undefined;
    if (style === 'Comment' && fontSize !== undefined) {
      const size = parseInt(fontSize, 10);
      if (!isNaN(size) && size >= 15) {
        return 'heading';
      }
    }
    if (style === 'Comment') {
      return 'comment';
    }
    if (style === 'Link') {
      return 'link';
    }
    return style || 'pad';
  }

  private static annotationStyle(pad: XmlElement): string | undefined {
    const settings = childElement(pad, 'ValueBoxSettings');
    if (!settings) {
      return undefined;
    }
    return childText(settings, 'stringtype');
  }

  public static linkHubIds(link: XmlElement): string[] | undefined {
    const value = attr(link, 'Ids');
    if (value === undefined) {
      return undefined;
    }
    const values = value.split(',').map((item) => item.trim());
    return values.length >= 2 && values.every((item) => item.length > 0) ? values : undefined;
  }

  public static linkEndpoints(link: XmlElement): [string, string] | undefined {
    const values = VlGraph.linkHubIds(link);
    return values ? [values[0], values[values.length - 1]] : undefined;
  }

  /** Operational nodes = the ones a patch view shows (no definitions, no
   *  stateful-region internals, no Application helper). */
  public operationalNodes(): XmlElement[] {
    const result: XmlElement[] = [];
    for (const node of this.nodes) {
      if (attr(node, 'Name') === 'Application') {
        continue;
      }
      let ancestor = this.parentOf.get(node);
      let insideRegion = false;
      while (ancestor !== undefined) {
        if (localName(ancestor) === 'Node') {
          const reference = childElement(ancestor, 'NodeReference');
          if (
            reference &&
            childElements(reference, 'Choice').some((c) => attr(c, 'Kind') === 'StatefulRegion')
          ) {
            insideRegion = true;
            break;
          }
        }
        ancestor = this.parentOf.get(ancestor);
      }
      if (insideRegion) {
        continue;
      }
      const reference = childElement(node, 'NodeReference');
      if (!reference) {
        continue;
      }
      const choices = childElements(reference, 'Choice');
      if (
        choices.some(
          (c) =>
            (attr(c, 'Kind') ?? '').endsWith('Definition') ||
            attr(c, 'Kind') === 'StatefulRegion'
        )
      ) {
        continue;
      }
      result.push(node);
    }
    return result;
  }

  /** The visible operation name from a node's NodeReference. */
  public static nodeName(node: XmlElement): string {
    const name = attr(node, 'Name');
    if (name) {
      return name;
    }
    const reference = childElement(node, 'NodeReference');
    if (!reference) {
      return '';
    }
    const choices = childElements(reference, 'Choice');
    return choices.length > 0 ? attr(choices[choices.length - 1], 'Name') ?? '' : '';
  }

  public canvases(): CanvasInfo[] {
    const result: CanvasInfo[] = [];
    for (const canvas of this.elements) {
      if (localName(canvas) !== 'Canvas' || attr(canvas, 'CanvasType') !== 'Group') {
        continue;
      }
      const id = attr(canvas, 'Id');
      const owner = this.parentOf.get(canvas);
      if (!id || !owner || localName(owner) !== 'Patch') {
        continue;
      }
      const definition = this.parentOf.get(owner);
      const isApplication = definition !== undefined && attr(definition, 'Name') === 'Application';
      result.push({
        id,
        name: (definition && attr(definition, 'Name')) ?? attr(owner, 'Name') ?? 'Canvas',
        patchId: attr(owner, 'Id') ?? '',
        definitionId: definition ? attr(definition, 'Id') : undefined,
        isApplication,
      });
    }
    return result;
  }

  public defaultCanvasId(): string | undefined {
    const canvases = this.canvases();
    return (canvases.find((canvas) => canvas.isApplication) ?? canvases[0])?.id;
  }

  /** Select a canvas and executable regions without entering definitions. */
  public canvasScope(canvasId: string | null): CanvasScope {
    if (canvasId === null) {
      return undefined;
    }
    const canvas = this.byId.get(canvasId);
    if (!canvas || localName(canvas) !== 'Canvas') {
      throw new Error(`Unknown canvas: ${canvasId}`);
    }
    const selected = new Set<XmlElement>();
    const pending: XmlElement[] = [canvas];
    while (pending.length > 0) {
      const element = pending.pop()!;
      if (localName(element) === 'Node') {
        const reference = childElement(element, 'NodeReference');
        if (
          reference &&
          childElements(reference, 'Choice').some((choice) =>
            (attr(choice, 'Kind') ?? '').endsWith('Definition')
          )
        ) {
          continue;
        }
      }
      selected.add(element);
      const children: XmlElement[] = [];
      for (let child = element.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 1) {
          children.push(child as XmlElement);
        }
      }
      pending.push(...children);
    }
    return selected;
  }

  public scopedNodes(scope: CanvasScope): XmlElement[] {
    if (scope === undefined) {
      return this.operationalNodes();
    }
    return this.nodes.filter((node) => {
      if (!scope.has(node)) {
        return false;
      }
      const reference = childElement(node, 'NodeReference');
      if (!reference) {
        return false;
      }
      return childElements(reference, 'Choice').every((choice) => {
        const kind = attr(choice, 'Kind') ?? '';
        return !kind.endsWith('Definition') && !kind.endsWith('Region');
      });
    });
  }

  public scopedLinks(scope: CanvasScope): XmlElement[] {
    if (scope === undefined) {
      return this.links;
    }
    return this.links.filter((link) => {
      if ((attr(link, 'IsHidden') ?? 'false').toLowerCase() === 'true') {
        return false;
      }
      const endpoints = VlGraph.linkEndpoints(link);
      return !!endpoints && endpoints.every((identifier) => {
        const endpoint = this.byId.get(identifier);
        return endpoint !== undefined && scope.has(endpoint);
      });
    });
  }

  public isInScope(element: XmlElement, scope: CanvasScope): boolean {
    return scope === undefined || scope.has(element);
  }

  public static isFeedback(link: XmlElement): boolean {
    return (attr(link, 'IsFeedback') ?? 'false').toLowerCase() === 'true';
  }

  public isRegionFeedback(link: XmlElement): boolean {
    if (!VlGraph.isFeedback(link)) {
      return false;
    }
    const endpoints = VlGraph.linkEndpoints(link);
    if (!endpoints) {
      return false;
    }
    const source = this.byId.get(endpoints[0]);
    const target = this.byId.get(endpoints[1]);
    if (!source || !target || localName(source) !== 'ControlPoint' || localName(target) !== 'ControlPoint') {
      return false;
    }
    const owner = this.parentOf.get(source);
    if (
      !owner ||
      localName(owner) !== 'Node' ||
      this.parentOf.get(target) !== owner
    ) {
      return false;
    }
    const alignments = new Set([attr(source, 'Alignment'), attr(target, 'Alignment')]);
    if (!alignments.has('Top') || !alignments.has('Bottom')) {
      return false;
    }
    const reference = childElement(owner, 'NodeReference');
    return (
      !!reference &&
      childElements(reference, 'Choice').some((c) => attr(c, 'Kind') === 'StatefulRegion')
    );
  }
}
