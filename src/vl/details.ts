import { dataHubLabel } from './geometry';
import { CanvasScope, VlGraph } from './graph';
import { XmlElement, attr, childElement, childElements, localName } from './xml';

export type PinDirection = 'input' | 'output' | 'other';

export interface PinDetails {
  id: string;
  name: string;
  kind: string;
  direction: PinDirection;
  hidden: boolean;
  defaultValue?: string;
  editable: boolean;
  readOnlyReason?: string;
}

export interface ElementDetails {
  id: string;
  kind: 'node' | 'pad' | 'other';
  name: string;
  category?: string;
  bounds?: string;
  value?: string;
  comment?: string;
  editable: boolean;
  pins: PinDetails[];
}

function optionalAttribute(element: XmlElement, name: string): string | undefined {
  return element.hasAttribute(name) ? element.getAttribute(name) ?? '' : undefined;
}

function pinDetails(pin: XmlElement): PinDetails {
  const kind = attr(pin, 'Kind') ?? '';
  const direction: PinDirection =
    kind === 'InputPin' || kind === 'StateInputPin' || kind === 'ApplyPin' || kind === 'ControlPoint'
      ? 'input'
      : kind === 'OutputPin' || kind === 'StateOutputPin'
        ? 'output'
        : 'other';
  const nestedDefault = childElement(pin, 'DefaultValue');
  const editable = direction === 'input' && nestedDefault === undefined;
  return {
    id: attr(pin, 'Id') ?? '',
    name: attr(pin, 'Name') ?? '',
    kind,
    direction,
    hidden: (attr(pin, 'IsHidden') ?? 'false').toLowerCase() === 'true',
    defaultValue: optionalAttribute(pin, 'DefaultValue') ?? nestedDefault?.textContent ?? undefined,
    editable,
    readOnlyReason: editable
      ? undefined
      : nestedDefault
        ? 'Nested DefaultValue elements are read-only in this version.'
        : 'Only input pin defaults are editable.',
  };
}

export function describeElement(
  graph: VlGraph,
  elementId: string,
  scope?: CanvasScope
): ElementDetails {
  const element = graph.byId.get(elementId);
  if (!element || !graph.isInScope(element, scope)) {
    throw new Error(`Unknown or out-of-scope element: ${elementId}`);
  }
  const kind = localName(element);
  if (kind === 'Node') {
    const reference = childElement(element, 'NodeReference');
    return {
      id: elementId,
      kind: 'node',
      name: VlGraph.nodeName(element),
      category: reference
        ? attr(reference, 'LastCategoryFullName') ?? attr(reference, 'LastDependency')
        : undefined,
      bounds: attr(element, 'Bounds'),
      editable: false,
      pins: childElements(element, 'Pin').map(pinDetails),
    };
  }
  if (kind === 'Pad') {
    const annotation = childElement(element, 'TypeAnnotation');
    return {
      id: elementId,
      kind: 'pad',
      name: dataHubLabel({ graph }, element) || attr(element, 'Comment') || 'Value',
      category: annotation
        ? attr(annotation, 'LastCategoryFullName') ?? attr(annotation, 'LastDependency')
        : undefined,
      bounds: attr(element, 'Bounds'),
      value: optionalAttribute(element, 'Value'),
      comment: attr(element, 'Comment'),
      editable: !attr(element, 'SlotId'),
      pins: [],
    };
  }
  return {
    id: elementId,
    kind: 'other',
    name: attr(element, 'Name') ?? kind,
    bounds: attr(element, 'Bounds'),
    editable: false,
    pins: [],
  };
}
