import * as assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { VlGraph } from '../vl/graph';
import { parseXml } from '../vl/xml';
import { validateGraph } from '../vl/validation';

const fixturesDir = join(__dirname, '..', '..', 'test', 'fixtures');

function fixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf8');
}

function codes(source: string): string[] {
  return validateGraph(new VlGraph(parseXml(source))).errors.map((item) => item.code);
}

describe('Offline VL validation', () => {
  it('accepts both real help patches', () => {
    assert.deepStrictEqual(codes(fixture('HowTo Simple PRC Robot in vvvv.vl')), []);
    assert.deepStrictEqual(codes(fixture('HowTo Serialize robot state.vl')), []);
  });

  it('rejects duplicate IDs', () => {
    const source = fixture('HowTo Simple PRC Robot in vvvv.vl').replace(
      'Id="KsqEeQ9aVrDLoYzOMYYwFN"',
      'Id="EK0y3vYqIdUNsC4Txj56LY"'
    );
    assert.ok(codes(source).includes('duplicate-id'));
  });

  it('rejects dangling and reversed visible links', () => {
    const source = fixture('HowTo Simple PRC Robot in vvvv.vl');
    const dangling = source.replace(
      'GXtNWfKuczuPSX8T7in7jc',
      'AAAAAAAAAAAAAAAAAAAAAA'
    );
    assert.ok(codes(dangling).includes('dangling-link'));

    const reversed = source.replace(
      'Ids="Gfz4hTv8eDfPjrFXDg1A1q,NRRpyma1GEGQWgFKzjk3mL"',
      'Ids="NRRpyma1GEGQWgFKzjk3mL,Gfz4hTv8eDfPjrFXDg1A1q"'
    );
    assert.ok(codes(reversed).includes('link-direction'));
  });
});
