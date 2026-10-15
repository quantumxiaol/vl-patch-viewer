import * as assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createStaticEdit, StaticEditResult } from '../vl/edits';
import { VlGraph } from '../vl/graph';
import { parseXml } from '../vl/xml';

const fixturesDir = join(__dirname, '..', '..', 'test', 'fixtures');
const applicationCanvas = 'MoUBUOuw7ReNPeaYiNlXkN';
const renderCanvas = 'GvNl6cKWmudLnTl41ytnfe';

function fixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf8');
}

function applyResult(source: string, result: StaticEditResult): string {
  return source.slice(0, result.start) + result.newText + source.slice(result.end);
}

function assertSingleRange(source: string, result: StaticEditResult): void {
  assert.strictEqual(result.updatedText, applyResult(source, result));
}

describe('Static VL edits', () => {
  it('changes an existing input default in place', () => {
    const source = fixture('HowTo Simple PRC Robot in vvvv.vl');
    const result = createStaticEdit(source, {
      type: 'setPinDefault',
      pinId: 'AvrELooatAhLU4PIe8RZL4',
      value: '2.5',
    }, renderCanvas);
    assert.strictEqual(result.newText, '2.5');
    assert.ok(result.updatedText.includes('DefaultValue="2.5"'));
    assertSingleRange(source, result);
  });

  it('inserts a missing default without changing the rest of the document', () => {
    const source = fixture('HowTo Simple PRC Robot in vvvv.vl');
    const result = createStaticEdit(source, {
      type: 'setPinDefault',
      pinId: 'SwHMGNcnZauPy8QptaMoLf',
      value: '1, 2, 3',
    });
    assert.strictEqual(result.start, result.end);
    assert.ok(result.updatedText.includes('DefaultValue="1, 2, 3"'));
    assertSingleRange(source, result);
  });

  it('round-trips XML-sensitive Pad values', () => {
    const source = fixture('HowTo Simple PRC Robot in vvvv.vl');
    const value = 'A&B <tag> "double" \'single\'\nnext\tend';
    const result = createStaticEdit(source, {
      type: 'setPadValue',
      padId: 'IsQLGWYVHhYNGOxtCvKEsD',
      value,
    });
    const graph = new VlGraph(parseXml(result.updatedText));
    assert.strictEqual(graph.byId.get('IsQLGWYVHhYNGOxtCvKEsD')?.getAttribute('Value'), value);
    assert.ok(result.updatedText.includes('&amp;'));
    assert.ok(result.updatedText.includes('&lt;tag&gt;'));
    assert.ok(result.updatedText.includes('&quot;double&quot;'));
    assertSingleRange(source, result);
  });

  it('preserves BOM, CRLF and every byte outside the edit range', () => {
    const source = fixture('HowTo Serialize robot state.vl').replace(/\r?\n/g, '\r\n');
    const result = createStaticEdit(source, {
      type: 'setPinDefault',
      pinId: 'VrooVluFJDSPWPlx0EAblP',
      value: 'False',
    });
    assert.strictEqual(result.updatedText.charCodeAt(0), 0xfeff);
    assert.ok(!result.updatedText.replace(/\r\n/g, '').includes('\n'));
    assertSingleRange(source, result);
  });

  it('ignores IDs in XML comments', () => {
    const pinId = 'AvrELooatAhLU4PIe8RZL4';
    const source = fixture('HowTo Simple PRC Robot in vvvv.vl').replace(
      '<Document ',
      `<!-- <Pin Id="${pinId}" DefaultValue="fake" /> -->\n<Document `
    );
    const result = createStaticEdit(source, {
      type: 'setPinDefault',
      pinId,
      value: '3.25',
    }, renderCanvas);
    assert.ok(result.updatedText.includes('DefaultValue="3.25"'));
    assert.ok(result.updatedText.includes('DefaultValue="fake"'));
  });

  it('rejects unsafe targets and structurally invalid documents', () => {
    const source = fixture('HowTo Simple PRC Robot in vvvv.vl');
    assert.throws(
      () => createStaticEdit(source, { type: 'setPinDefault', pinId: 'SCkt9193TTrLWs6ze3zQEV', value: '1' }, renderCanvas),
      /Only input pin/
    );
    assert.throws(
      () => createStaticEdit(source, { type: 'setPinDefault', pinId: 'GQpkeYyYtPWON8dSaUXJsi', value: 'True' }, renderCanvas),
      /Nested DefaultValue/
    );
    assert.throws(
      () => createStaticEdit(source, { type: 'setPinDefault', pinId: 'AvrELooatAhLU4PIe8RZL4', value: '1' }, applicationCanvas),
      /out-of-scope/
    );
    assert.throws(
      () => createStaticEdit(source, { type: 'setPadValue', padId: 'missing', value: '1' }, null),
      /Unknown or out-of-scope/
    );

    const duplicate = source.replace('Id="KsqEeQ9aVrDLoYzOMYYwFN"', 'Id="EK0y3vYqIdUNsC4Txj56LY"');
    assert.throws(
      () => createStaticEdit(duplicate, { type: 'setPadValue', padId: 'IsQLGWYVHhYNGOxtCvKEsD', value: '1' }),
      /Refusing to edit invalid VL document: duplicate-id/
    );
  });
});
