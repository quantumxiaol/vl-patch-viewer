import * as assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { describeElement } from '../vl/details';
import { VlGraph } from '../vl/graph';
import { parseXml } from '../vl/xml';

const fixturesDir = join(__dirname, '..', '..', 'test', 'fixtures');

function graph(): VlGraph {
  return new VlGraph(parseXml(readFileSync(join(fixturesDir, 'HowTo Simple PRC Robot in vvvv.vl'), 'utf8')));
}

describe('Canvas scopes', () => {
  it('discovers Process canvases and isolates their nodes and links', () => {
    const document = graph();
    const canvases = document.canvases();
    assert.deepStrictEqual(canvases.map((canvas) => canvas.name), ['RenderPRCRobot', 'Application']);
    const application = canvases.find((canvas) => canvas.isApplication);
    const render = canvases.find((canvas) => canvas.name === 'RenderPRCRobot');
    assert.ok(application && render);
    assert.strictEqual(document.defaultCanvasId(), application.id);

    const applicationNodes = document.scopedNodes(document.canvasScope(application.id)).map(VlGraph.nodeName);
    const renderNodes = document.scopedNodes(document.canvasScope(render.id)).map(VlGraph.nodeName);
    assert.ok(applicationNodes.includes('RobotAssembly'));
    assert.ok(!applicationNodes.includes('SceneWindow'));
    assert.ok(renderNodes.includes('SceneWindow'));
    assert.ok(!renderNodes.includes('RobotAssembly'));

    const applicationLinks = document.scopedLinks(document.canvasScope(application.id));
    assert.ok(applicationLinks.length > 0);
    assert.ok(applicationLinks.length < document.links.length);
  });

  it('keeps the whole-document path and includes executable regions but not definitions', () => {
    const document = graph();
    const wholeNodes = document.scopedNodes(document.canvasScope(null)).map(VlGraph.nodeName);
    assert.ok(wholeNodes.includes('RobotAssembly'));
    assert.ok(wholeNodes.includes('SceneWindow'));
    assert.throws(() => document.canvasScope('missing'), /unknown canvas/i);

    const scoped = new VlGraph(parseXml(`<Document xmlns:p="property"><Patch><Node Name="Application"><p:NodeReference><Choice Kind="ContainerDefinition" Name="Process" /></p:NodeReference><Patch><Canvas Id="app" CanvasType="Group"><Node Id="region"><p:NodeReference><Choice Kind="StatefulRegion" Name="Repeat" /></p:NodeReference><Patch><Canvas><Node Id="nested"><p:NodeReference><Choice Kind="ProcessNode" Name="Nested" /></p:NodeReference></Node></Canvas></Patch></Node><Node Id="definition"><p:NodeReference><Choice Kind="ContainerDefinition" Name="Process" /></p:NodeReference><Patch><Canvas><Node Id="foreign"><p:NodeReference><Choice Kind="ProcessNode" Name="Foreign" /></p:NodeReference></Node></Canvas></Patch></Node></Canvas></Patch></Node></Patch></Document>`));
    const scope = scoped.canvasScope('app')!;
    assert.ok(scope.has(scoped.byId.get('nested')!));
    assert.ok(!scope.has(scoped.byId.get('definition')!));
    assert.ok(!scope.has(scoped.byId.get('foreign')!));
    assert.deepStrictEqual(scoped.scopedNodes(scope).map(VlGraph.nodeName), ['Nested']);
  });
});

describe('Element details', () => {
  it('reads node category, pin defaults, direction and editability', () => {
    const document = graph();
    const render = document.canvases().find((canvas) => canvas.name === 'RenderPRCRobot')!;
    const details = describeElement(document, 'Gpxpd2jqMyiQHMUSo0vMTS', document.canvasScope(render.id));
    assert.strictEqual(details.name, 'PBRMaterial');
    assert.strictEqual(details.category, 'Stride.Materials');
    const color = details.pins.find((pin) => pin.name === 'Color');
    const stateOutput = details.pins.find((pin) => pin.name === 'State Output');
    assert.ok(color && stateOutput);
    assert.strictEqual(color.defaultValue, '0.34000003, 0.34000003, 0.34000003, 1');
    assert.strictEqual(color.editable, true);
    assert.strictEqual(stateOutput.direction, 'output');
    assert.strictEqual(stateOutput.editable, false);
  });

  it('reads Pad values and keeps nested defaults read-only', () => {
    const document = graph();
    const canvases = document.canvases();
    const application = canvases.find((canvas) => canvas.isApplication)!;
    const render = canvases.find((canvas) => canvas.name === 'RenderPRCRobot')!;
    const pad = describeElement(document, 'IsQLGWYVHhYNGOxtCvKEsD', document.canvasScope(application.id));
    assert.strictEqual(pad.value, 'Alice');
    assert.strictEqual(pad.editable, true);

    const nested = describeElement(document, 'BxU3HDze1FgMRgYatYOKz1', document.canvasScope(render.id));
    const pin = nested.pins.find((item) => item.name === 'Extend Into Title Bar');
    assert.ok(pin);
    assert.strictEqual(pin.defaultValue, 'False');
    assert.strictEqual(pin.editable, false);
    assert.match(pin.readOnlyReason ?? '', /nested/i);
    assert.throws(
      () => describeElement(document, 'IsQLGWYVHhYNGOxtCvKEsD', document.canvasScope(render.id)),
      /out-of-scope/i
    );
  });
});
