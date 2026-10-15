// Unit tests for the built-in VL → SVG renderer.
// Run with: npm test  (compiles, then runs mocha over out/test/**/*.test.js)
import * as assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { BuiltinRenderer } from '../renderer';

const fixturesDir = join(__dirname, '..', '..', 'test', 'fixtures');
const renderer = new BuiltinRenderer();

function fixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf8');
}

describe('BuiltinRenderer', () => {
  it('renders a help patch into an SVG document', () => {
    const result = renderer.render(fixture('HowTo Simple PRC Robot in vvvv.vl'));
    assert.ok(result.svg.startsWith('<svg xmlns='), 'should start with an <svg> root');
    assert.ok(result.svg.includes('class="node"'), 'should contain node rectangles');
    assert.ok(result.svg.includes('class="pin"'), 'should contain pin circles');
    assert.ok(result.svg.includes('<path class="link"'), 'should contain links');
    assert.ok(result.svg.includes('viewBox='), 'should define a viewBox');
    assert.ok(result.svg.includes('data-element-id='), 'should expose selectable elements');
  });

  it('scopes the default render to Application and supports the whole document', () => {
    const source = fixture('HowTo Simple PRC Robot in vvvv.vl');
    const application = renderer.render(source);
    assert.strictEqual(application.canvases.length, 2);
    assert.ok(application.selectedCanvasId);
    assert.ok(application.svg.includes('RobotAssembly'));
    assert.ok(!application.svg.includes('SceneWindow'));

    const whole = renderer.render(source, null);
    assert.strictEqual(whole.selectedCanvasId, null);
    assert.ok(whole.svg.includes('RobotAssembly'));
    assert.ok(whole.svg.includes('SceneWindow'));
  });

  it('renders deterministically', () => {
    const first = renderer.render(fixture('HowTo Simple PRC Robot in vvvv.vl'));
    const second = renderer.render(fixture('HowTo Simple PRC Robot in vvvv.vl'));
    assert.strictEqual(first.svg, second.svg);
  });

  it('tolerates the UTF-8 BOM vvvv writes', () => {
    const bytes = readFileSync(join(fixturesDir, 'HowTo Serialize robot state.vl'));
    assert.deepStrictEqual(
      Array.from(bytes.subarray(0, 3)),
      [0xef, 0xbb, 0xbf],
      'fixture should retain its UTF-8 BOM bytes on every platform'
    );
    const text = bytes.toString('utf8');
    assert.strictEqual(text.charCodeAt(0), 0xfeff);
    const result = renderer.render(text);
    assert.ok(result.svg.includes('<svg xmlns='));
  });

  it('handles documents without a BOM', () => {
    const text = fixture('HowTo Serialize robot state.vl');
    const stripped = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const result = renderer.render(stripped);
    assert.ok(result.svg.includes('<svg xmlns='));
  });

  it('throws on invalid XML', () => {
    assert.throws(() => renderer.render('this is not xml at all'), /parse/i);
  });

  it('throws on empty renderable content', () => {
    assert.throws(() => renderer.render('<Document xmlns:p="property" />'), /no renderable/i);
  });
});
