import { VlGraph } from './graph';
import { XmlElement, attr, childElement, childElements, isElement, localName } from './xml';

export interface Diagnostic {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  elementId?: string;
}

export class ValidationReport {
  public readonly diagnostics: Diagnostic[] = [];

  public get errors(): Diagnostic[] {
    return this.diagnostics.filter((item) => item.severity === 'error');
  }

  public get ok(): boolean {
    return this.errors.length === 0;
  }

  public add(code: string, message: string, element?: XmlElement): void {
    this.diagnostics.push({ code, message, severity: 'error', elementId: element ? attr(element, 'Id') : undefined });
  }
}

const ID_PATTERN = /^[A-Za-z0-9]{22}$/;
const DEPENDENCY_KINDS = new Set(['NugetDependency', 'DocumentDependency', 'PlatformDependency', 'ProjectDependency']);

function isDefinition(element: XmlElement): boolean {
  const reference = childElement(element, 'NodeReference');
  return !!reference && childElements(reference, 'Choice').some((choice) =>
    (attr(choice, 'Kind') ?? '').endsWith('Definition')
  );
}

function definitionScope(graph: VlGraph, element: XmlElement): XmlElement {
  let current = element;
  let parent = graph.parent(current);
  while (parent) {
    if (localName(parent) === 'Node' && isDefinition(parent)) {
      return parent;
    }
    current = parent;
    parent = graph.parent(current);
  }
  return graph.root;
}

function validateApplication(graph: VlGraph, report: ValidationReport): void {
  for (const application of graph.nodes.filter((node) => attr(node, 'Name') === 'Application')) {
    const reference = childElement(application, 'NodeReference');
    const isProcess = !!reference && childElements(reference, 'Choice').some((choice) =>
      attr(choice, 'Kind') === 'ContainerDefinition' && attr(choice, 'Name') === 'Process'
    );
    if (!isProcess) {
      continue;
    }
    const patch = childElement(application, 'Patch');
    if (!patch) {
      report.add('application-patch', 'Process Application must contain an inner Patch', application);
      continue;
    }
    if (!childElements(patch, 'Canvas').some((canvas) => attr(canvas, 'CanvasType') === 'Group')) {
      report.add('application-canvas', 'Process Application must contain a Group Canvas', patch);
    }
    const lifecyclePatches = childElements(patch, 'Patch').filter((item) =>
      attr(item, 'Name') === 'Create' || attr(item, 'Name') === 'Update'
    );
    for (const name of ['Create', 'Update']) {
      if (!lifecyclePatches.some((item) => attr(item, 'Name') === name)) {
        report.add(`application-${name.toLowerCase()}`, `Process Application must contain a sibling Patch named ${name}`, patch);
      }
    }
    const definition = childElement(patch, 'ProcessDefinition');
    if (!definition) {
      report.add('application-process-definition', 'Process Application must contain a ProcessDefinition', patch);
    } else {
      const enabledTargets = new Set(
        childElements(definition, 'Fragment')
          .filter((fragment) => attr(fragment, 'Enabled') === 'true')
          .map((fragment) => attr(fragment, 'Patch'))
      );
      for (const lifecycle of lifecyclePatches) {
        const id = attr(lifecycle, 'Id');
        if (id && !enabledTargets.has(id)) {
          report.add('application-lifecycle-fragment', `ProcessDefinition must enable the ${attr(lifecycle, 'Name')} patch`, definition);
        }
      }
    }
  }
}

function validateIds(graph: VlGraph, report: ValidationReport): void {
  const ids = new Map<string, XmlElement[]>();
  for (const element of graph.elements) {
    const id = attr(element, 'Id');
    if (!id) {
      continue;
    }
    const elements = ids.get(id) ?? [];
    elements.push(element);
    ids.set(id, elements);
  }
  for (const [id, elements] of ids) {
    if (elements.length > 1) {
      report.add('duplicate-id', `ID occurs ${elements.length} times`, elements[0]);
    }
    if (!ID_PATTERN.test(id)) {
      report.add('invalid-id', 'ID must be an exactly 22-character base62 identifier', elements[0]);
    }
  }
}

function validatePatches(graph: VlGraph, report: ValidationReport): void {
  for (const patch of graph.elements.filter((element) => localName(element) === 'Patch')) {
    for (let child = patch.firstChild; child; child = child.nextSibling) {
      if (isElement(child) && DEPENDENCY_KINDS.has(localName(child))) {
        report.add('nested-dependency', 'Dependencies must be direct children of Document', child);
      }
    }
    const siblingIds = new Set(
      childElements(patch, 'Patch').map((item) => attr(item, 'Id')).filter((id) => id !== undefined)
    );
    for (const definition of childElements(patch, 'ProcessDefinition')) {
      for (const fragment of childElements(definition, 'Fragment')) {
        const target = attr(fragment, 'Patch');
        if (target && !siblingIds.has(target)) {
          report.add('dangling-fragment', `Fragment points to missing sibling Patch ${target}`, fragment);
        }
      }
    }
  }
}

function isInput(kind: string | null | undefined): boolean {
  return kind === 'InputPin' || kind === 'StateInputPin' || kind === 'ApplyPin' || kind === 'ControlPoint';
}

function isOutput(kind: string | null | undefined): boolean {
  return kind === 'OutputPin' || kind === 'StateOutputPin' || kind === 'ControlPoint';
}

function validateLinks(graph: VlGraph, report: ValidationReport): void {
  for (const link of graph.links) {
    const hubs = VlGraph.linkHubIds(link);
    if (!hubs) {
      report.add('link-shape', 'Link Ids must contain at least two non-empty IDs', link);
      continue;
    }
    if (hubs.some((id) => !graph.byId.has(id))) {
      report.add('dangling-link', 'Link endpoint does not resolve', link);
      continue;
    }
    const [source, target] = [hubs[0], hubs[hubs.length - 1]];
    const hidden = (attr(link, 'IsHidden') ?? 'false').toLowerCase() === 'true';
    const sourceKind = graph.endpointKind.get(source);
    const targetKind = graph.endpointKind.get(target);
    if (!hidden && isInput(sourceKind) && sourceKind !== 'ControlPoint') {
      report.add('link-direction', 'Link source is an input pin; source must be an output or pad', link);
    }
    if (!hidden && isOutput(targetKind) && targetKind !== 'ControlPoint') {
      report.add('link-direction', 'Link target is an output pin; target must be an input', link);
    }
    if (VlGraph.isFeedback(link) && !graph.isRegionFeedback(link)) {
      report.add('unsupported-feedback-link', 'IsFeedback is only valid for region border-pair metadata', link);
    }
  }
}

function validateSlots(graph: VlGraph, report: ValidationReport): void {
  for (const controlPoint of graph.controlPoints) {
    if (attr(controlPoint, 'DefinitionId')) {
      report.add('unsupported-input-selector', 'ControlPoint DefinitionId is not a VL input selector', controlPoint);
    }
  }
  for (const pad of graph.pads) {
    const slotId = attr(pad, 'SlotId');
    if (!slotId) {
      continue;
    }
    const slot = graph.byId.get(slotId);
    if (!slot || localName(slot) !== 'Slot') {
      report.add('dangling-slot', 'Pad SlotId must reference a Slot', pad);
    } else if (definitionScope(graph, slot) !== definitionScope(graph, pad)) {
      report.add('slot-scope', "Slot accessor must stay within the Slot's definition", pad);
    }
  }
}

function validateAnnotations(graph: VlGraph, report: ValidationReport): void {
  for (const annotation of graph.annotations()) {
    if (localName(annotation) !== 'Pad') {
      continue;
    }
    const settings = childElement(annotation, 'ValueBoxSettings');
    const size = settings ? childElement(settings, 'fontsize') : undefined;
    const stringType = settings ? childElement(settings, 'stringtype') : undefined;
    if (!size || size.getAttribute('p:Type') !== 'Int32') {
      report.add('annotation-font-type', 'Visible comment fontsize must use p:Type="Int32"', annotation);
    }
    if (
      !stringType ||
      stringType.getAttribute('p:Assembly') !== 'VL.Core' ||
      stringType.getAttribute('p:Type') !== 'VL.Core.StringType'
    ) {
      report.add('annotation-string-type', 'Visible comments and links must use canonical type attributes', annotation);
    }
  }
}

export function validateGraph(graph: VlGraph): ValidationReport {
  const report = new ValidationReport();
  if (localName(graph.root) !== 'Document') {
    report.add('root-name', 'Document root must be <Document>', graph.root);
  }
  if (graph.root.getAttribute('xmlns:p') !== 'property') {
    report.add('property-namespace', 'Document must declare xmlns:p="property"', graph.root);
  }
  if (attr(graph.root, 'Version') !== '0.128') {
    report.add('version', 'Document Version must be 0.128', graph.root);
  }
  if (!childElements(graph.root, 'NugetDependency').some((item) => attr(item, 'Location') === 'VL.CoreLib')) {
    report.add('core-dependency', 'Document is missing its direct VL.CoreLib dependency', graph.root);
  }
  validateApplication(graph, report);
  validateIds(graph, report);
  validatePatches(graph, report);
  validateSlots(graph, report);
  validateLinks(graph, report);
  validateAnnotations(graph, report);
  return report;
}

export function formatValidationErrors(report: ValidationReport): string {
  return report.errors.map((item) => `${item.code}: ${item.message}`).join('; ');
}
