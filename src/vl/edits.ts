import { VlGraph } from './graph';
import { formatValidationErrors, validateGraph } from './validation';
import { attr, childElement, localName, parseXml } from './xml';

export type StaticEditRequest =
  | { type: 'setPinDefault'; pinId: string; value: string }
  | { type: 'setPadValue'; padId: string; value: string };

export interface StaticEditResult {
  start: number;
  end: number;
  newText: string;
  updatedText: string;
}

interface SourceAttribute {
  name: string;
  value: string;
  quote: string;
  valueStart: number;
  valueEnd: number;
}

interface StartTag {
  name: string;
  end: number;
  attributes: SourceAttribute[];
}

interface SourceChange {
  start: number;
  end: number;
  newText: string;
}

function isNameChar(value: string): boolean {
  return value.length === 1 && /[A-Za-z0-9_.:-]/.test(value);
}

function parseAttributes(source: string, position: number, close: number): SourceAttribute[] {
  const attributes: SourceAttribute[] = [];
  let index = position;
  while (index < close) {
    while (index < close && (/\s/.test(source[index]) || source[index] === '/')) {
      index++;
    }
    if (index >= close) {
      break;
    }
    const nameStart = index;
    while (index < close && isNameChar(source[index])) {
      index++;
    }
    const name = source.slice(nameStart, index);
    while (index < close && /\s/.test(source[index])) {
      index++;
    }
    if (!name || source[index] !== '=') {
      index++;
      continue;
    }
    index++;
    while (index < close && /\s/.test(source[index])) {
      index++;
    }
    const quote = source[index];
    if (quote !== '"' && quote !== "'") {
      throw new Error('Invalid XML attribute quote');
    }
    index++;
    const valueStart = index;
    while (index < close && source[index] !== quote) {
      index++;
    }
    if (index >= close) {
      throw new Error('Unterminated XML attribute');
    }
    attributes.push({
      name,
      value: source.slice(valueStart, index),
      quote,
      valueStart,
      valueEnd: index,
    });
    index++;
  }
  return attributes;
}

function readStartTag(source: string, start: number): StartTag | undefined {
  let index = start + 1;
  const nameStart = index;
  while (index < source.length && isNameChar(source[index])) {
    index++;
  }
  if (index === nameStart) {
    return undefined;
  }
  const name = source.slice(nameStart, index);
  const attributeStart = index;
  let quote = '';
  for (; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (char === quote) {
        quote = '';
      }
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return { name, end: index + 1, attributes: parseAttributes(source, attributeStart, index) };
    }
  }
  return undefined;
}

function skipPast(source: string, token: string, start: number): number {
  const index = source.indexOf(token, start);
  return index < 0 ? source.length : index + token.length;
}

function findStartTag(source: string, elementId: string, expectedName: string): StartTag {
  let position = 0;
  while (position < source.length) {
    const start = source.indexOf('<', position);
    if (start < 0) {
      break;
    }
    if (source.startsWith('<!--', start)) {
      position = skipPast(source, '-->', start + 4);
      continue;
    }
    if (source.startsWith('<![CDATA[', start)) {
      position = skipPast(source, ']]>', start + 9);
      continue;
    }
    if (source.startsWith('<?', start)) {
      position = skipPast(source, '?>', start + 2);
      continue;
    }
    if (source[start + 1] === '!' || source[start + 1] === '/') {
      position = start + 2;
      continue;
    }
    const tag = readStartTag(source, start);
    if (!tag) {
      position = start + 1;
      continue;
    }
    if (tag.name === expectedName) {
      const id = tag.attributes.find((attribute) => attribute.name === 'Id');
      if (id?.value === elementId) {
        return tag;
      }
    }
    position = tag.end;
  }
  throw new Error(`Could not locate ${expectedName} ${elementId} in the source XML`);
}

function escapeAttribute(value: string, quote: string): string {
  let escaped = value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\t/g, '&#9;')
    .replace(/\r/g, '&#13;')
    .replace(/\n/g, '&#10;');
  if (quote === '"') {
    escaped = escaped.replace(/"/g, '&quot;');
  } else {
    escaped = escaped.replace(/'/g, '&apos;');
  }
  return escaped;
}

function setAttribute(
  source: string,
  tag: StartTag,
  name: string,
  value: string
): SourceChange {
  const existing = tag.attributes.find((attribute) => attribute.name === name);
  if (existing) {
    return {
      start: existing.valueStart,
      end: existing.valueEnd,
      newText: escapeAttribute(value, existing.quote),
    };
  }
  const close = tag.end - 1;
  const selfClosing = source[close - 1] === '/';
  const insertAt = selfClosing ? close - 1 : close;
  const hasLeadingWhitespace = insertAt > 0 && /\s/.test(source[insertAt - 1]);
  return {
    start: insertAt,
    end: insertAt,
    newText: `${hasLeadingWhitespace ? '' : ' '}${name}="${escapeAttribute(value, '"')}"${selfClosing ? ' ' : ''}`,
  };
}

function applyChange(source: string, change: SourceChange): string {
  return source.slice(0, change.start) + change.newText + source.slice(change.end);
}

function selectedScope(graph: VlGraph, canvasId?: string | null): Set<import('./xml').XmlElement> | undefined {
  const requested = canvasId === undefined ? graph.defaultCanvasId() : canvasId;
  const selected = requested === null
    ? null
    : typeof requested === 'string' && graph.canvases().some((canvas) => canvas.id === requested)
      ? requested
      : graph.defaultCanvasId() ?? null;
  return graph.canvasScope(selected);
}

function assertValid(graph: VlGraph): void {
  const report = validateGraph(graph);
  if (!report.ok) {
    throw new Error(`Refusing to edit invalid VL document: ${formatValidationErrors(report)}`);
  }
}

export function createStaticEdit(
  sourceText: string,
  request: StaticEditRequest,
  canvasId?: string | null
): StaticEditResult {
  if (typeof request.value !== 'string') {
    throw new Error('Static edit value must be a string');
  }
  const graph = new VlGraph(parseXml(sourceText));
  assertValid(graph);
  const scope = selectedScope(graph, canvasId);

  let elementId: string;
  let expectedName: string;
  let attributeName: string;
  if (request.type === 'setPinDefault') {
    elementId = request.pinId;
    expectedName = 'Pin';
    attributeName = 'DefaultValue';
    const pin = graph.byId.get(elementId);
    if (!pin || localName(pin) !== 'Pin' || !graph.isInScope(pin, scope)) {
      throw new Error(`Unknown or out-of-scope input pin: ${elementId}`);
    }
    const kind = attr(pin, 'Kind');
    if (kind !== 'InputPin' && kind !== 'StateInputPin' && kind !== 'ApplyPin' && kind !== 'ControlPoint') {
      throw new Error('Only input pin DefaultValue attributes are editable');
    }
    if (childElement(pin, 'DefaultValue')) {
      throw new Error('Nested DefaultValue elements are read-only in this version');
    }
  } else if (request.type === 'setPadValue') {
    elementId = request.padId;
    expectedName = 'Pad';
    attributeName = 'Value';
    const pad = graph.byId.get(elementId);
    if (!pad || localName(pad) !== 'Pad' || !graph.isInScope(pad, scope)) {
      throw new Error(`Unknown or out-of-scope Pad: ${elementId}`);
    }
    if (attr(pad, 'SlotId')) {
      throw new Error('Slot pads are read-only in this version');
    }
  } else {
    throw new Error('Unsupported static edit operation');
  }

  const tag = findStartTag(sourceText, elementId, expectedName);
  const change = setAttribute(sourceText, tag, attributeName, request.value);
  const updatedText = applyChange(sourceText, change);
  const updatedGraph = new VlGraph(parseXml(updatedText));
  assertValid(updatedGraph);
  const updatedValue = updatedGraph.byId.get(elementId)?.getAttribute(attributeName);
  if (updatedValue !== request.value) {
    throw new Error(`Static edit did not round-trip ${attributeName}`);
  }
  return { ...change, updatedText };
}
