import * as assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { BuiltinRenderer } from '../renderer';
import { VlGraph } from '../vl/graph';
import { parseXml } from '../vl/xml';
import { validateGraph } from '../vl/validation';

const fixturesDir = join(__dirname, '..', '..', 'test', 'fixtures');
const renderer = new BuiltinRenderer();
const cases = [
  { name: 'VL.OpenEXR', file: 'openexr/Example Write an exr texture.vl', canvases: 1 },
  { name: 'VL.Elementa', file: 'elementa/Tutorial Getting Started.vl', canvases: 1 },
  { name: 'VL.Stride.Voxels', file: 'voxels/Reference Voxels GI Minimal.vl', canvases: 3 },
  { name: 'VL.Stride.Text3d', file: 'text3d/Reference Triplanar.vl', canvases: 3 },
  { name: 'VL.RogueSharp', file: 'roguesharp/HowTo Roll Dice.vl', canvases: 1 },
];

describe('Third-party VL corpus', () => {
  for (const testCase of cases) {
    it(`renders and validates ${testCase.name}`, () => {
      const source = readFileSync(join(fixturesDir, testCase.file), 'utf8');
      const graph = new VlGraph(parseXml(source));
      assert.deepStrictEqual(validateGraph(graph).errors, []);

      const first = renderer.render(source);
      const second = renderer.render(source);
      assert.strictEqual(first.canvases.length, testCase.canvases);
      assert.ok(first.svg.startsWith('<svg xmlns='));
      assert.ok(first.svg.includes('data-element-id='));
      assert.strictEqual(first.svg, second.svg);
    });
  }
});
