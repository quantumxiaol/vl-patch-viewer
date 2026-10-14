// Minimal XML layer over @xmldom/xmldom tuned for VL documents.
// VL files are machine-generated XML: elements with prefixed tags
// (p:NodeReference) mixed with unprefixed ones (Pin, Pad, Link), so all tag
// matching here is done on the LOCAL name (prefix stripped).
import { DOMParser, Element, Node } from '@xmldom/xmldom';

export type XmlElement = Element;

export function parseXml(text: string): XmlElement {
  // vvvv writes .vl files with a UTF-8 BOM; xmldom rejects an XML
  // declaration that follows a BOM, so strip it before parsing.
  const stripped = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const errors: string[] = [];
  const document = new DOMParser({
    onError: (level: string, message: string): void => {
      // xmldog reports even non-fatal issues through this callback; fatal
      // ones end up in `errors` and make us throw below.
      if (level === 'fatalError') {
        errors.push(message);
      }
    },
  }).parseFromString(stripped, 'text/xml');
  const root = document?.documentElement;
  if (!root || errors.length > 0) {
    throw new Error(
      `Failed to parse VL XML${errors.length ? `: ${errors[0]}` : ': empty document'}`
    );
  }
  return root;
}

/** Local name of a node: "p:NodeReference" -> "NodeReference". */
export function localName(node: Node): string {
  const name = node.nodeName || '';
  const colon = name.indexOf(':');
  return colon >= 0 ? name.slice(colon + 1) : name;
}

export function attr(element: XmlElement, name: string): string | undefined {
  const value = element.getAttribute(name);
  return value === '' || value === null ? undefined : value;
}

export function isElement(node: Node): node is XmlElement {
  return node.nodeType === 1;
}

/** Direct child elements whose local name matches. */
export function childElements(element: XmlElement, name: string): XmlElement[] {
  const result: XmlElement[] = [];
  for (let child = element.firstChild; child; child = child.nextSibling) {
    if (isElement(child) && localName(child) === name) {
      result.push(child);
    }
  }
  return result;
}

/** First direct child element with the given local name, or undefined. */
export function childElement(element: XmlElement, name: string): XmlElement | undefined {
  for (let child = element.firstChild; child; child = child.nextSibling) {
    if (isElement(child) && localName(child) === name) {
      return child;
    }
  }
  return undefined;
}

/** Depth-first iterator over ALL descendant elements (including self? no). */
export function* descendants(element: XmlElement, name: string): Generator<XmlElement> {
  const stack: Node[] = [];
  for (let child = element.firstChild; child; child = child.nextSibling) {
    stack.push(child);
  }
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (isElement(node)) {
      if (localName(node) === name) {
        yield node;
      }
      for (let child = node.firstChild; child; child = child.nextSibling) {
        stack.push(child);
      }
    }
  }
}

/** Text content of the first child element with the given local name. */
export function childText(element: XmlElement, name: string): string | undefined {
  const child = childElement(element, name);
  if (!child) {
    return undefined;
  }
  return child.textContent ?? undefined;
}
