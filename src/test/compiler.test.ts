import * as assert from 'assert';
import { compilePatch, compilerOutputToText, detectCompiler, DetectionDependencies, parseCompilerOutput, ProcessResult } from '../vl/compiler';

function dependencies(overrides: DetectionDependencies = {}): DetectionDependencies {
  return {
    platform: 'win32',
    exists: () => true,
    readRegistry: async () => [],
    readDirectories: async () => [],
    probe: async () => true,
    ...overrides,
  };
}

describe('vvvvc detection', () => {
  it('does not probe on non-Windows platforms', async () => {
    let probed = false;
    const result = await detectCompiler(dependencies({
      platform: 'linux',
      probe: async () => {
        probed = true;
        return true;
      },
    }));
    assert.strictEqual(result.status, 'unavailable');
    assert.strictEqual(probed, false);
  });

  it('uses and validates an explicit path without falling back', async () => {
    const found = await detectCompiler(dependencies({
      vvvvcPath: 'C:\\custom\\vvvvc.exe',
      exists: () => true,
      probe: async () => true,
    }));
    assert.strictEqual(found.status, 'found');
    assert.strictEqual(found.installation?.path, 'C:\\custom\\vvvvc.exe');

    const invalid = dependencies({ vvvvcPath: 'C:\\missing\\vvvvc.exe', exists: () => false });
    await assert.rejects(detectCompiler(invalid), /missing or not executable/);
  });

  it('detects a stable installation from the registry, including _is1 suffixes', async () => {
    const installDir = 'C:\\Program Files\\vvvv\\vvvv_gamma_8.0-0184-gd02135cf16-win-x64\\';
    const found = await detectCompiler(dependencies({
      readRegistry: async () => [installDir],
      readDirectories: async () => [],
      exists: () => true,
    }));
    assert.strictEqual(found.status, 'found');
    assert.strictEqual(found.installation?.path, `${installDir}vvvvc.exe`);
    assert.strictEqual(found.installation?.major, 8);
    assert.strictEqual(found.installation?.preview, 184);
  });

  it('sorts stable versions, filters previews and tries candidates in order', async () => {
    const attempts: string[] = [];
    const found = await detectCompiler(dependencies({
      readRegistry: async () => [
        'C:\\Program Files\\vvvv\\vvvv_gamma_7.0-0001-win-x64',
        'C:\\Program Files\\vvvv\\vvvv_gamma_9.0-beta-0002-win-x64',
        'C:\\Program Files\\vvvv\\vvvv_gamma_8.0-0184-win-x64',
      ],
      probe: async (file) => {
        attempts.push(file);
        return !file.includes('9.0');
      },
      exists: () => true,
    }));
    assert.strictEqual(found.status, 'found');
    assert.ok(found.installation?.path.includes('8.0-0184'));
    assert.ok(!attempts.some((file) => file.includes('beta')));
  });

  it('falls back to directory scanning and reports no usable installation', async () => {
    const found = await detectCompiler(dependencies({
      readRegistry: async () => { throw new Error('registry unavailable'); },
      readDirectories: async () => ['vvvv_gamma_7.0-0001-win-x64'],
      exists: () => true,
    }));
    assert.strictEqual(found.status, 'found');

    const unavailable = await detectCompiler(dependencies({
      readRegistry: async () => { throw new Error('registry unavailable'); },
      readDirectories: async () => { throw new Error('directory unavailable'); },
    }));
    assert.strictEqual(unavailable.status, 'unavailable');
  });
});

describe('vvvvc compilation and diagnostics', () => {
  it('passes the expected arguments and cleans temporary output on success', async () => {
    let removed = '';
    let received: { file: string; args: string[] } | undefined;
    const result = await compilePatch({
      filePath: 'C:\\work\\good.vl',
      vvvvcPath: 'C:\\vvvv\\vvvvc.exe',
      exec: async (file, args) => {
        received = { file, args };
        return { code: 0, stdout: 'success', stderr: '' };
      },
      makeTempDirectory: async () => 'C:\\temp\\vl-check',
      removeDirectory: async (directory) => { removed = directory; },
    });
    assert.strictEqual(result.code, 0);
    assert.strictEqual(removed, 'C:\\temp\\vl-check');
    assert.deepStrictEqual(received?.args.slice(0, 4), [
      'C:\\work\\good.vl',
      '--output-directory',
      'C:\\temp\\vl-check',
      '--output-type',
    ]);
  });

  it('passes an optional NuGet path and cleans output on failure', async () => {
    let removed = false;
    const result = await compilePatch({
      filePath: 'C:\\work\\broken.vl',
      vvvvcPath: 'C:\\vvvv\\vvvvc.exe',
      nugetPath: 'C:\\custom\\nugets',
      exec: async () => ({ code: 127, stdout: 'failed', stderr: 'compile error' }),
      makeTempDirectory: async () => 'C:\\temp\\vl-check',
      removeDirectory: async () => { removed = true; },
    });
    assert.strictEqual(result.code, 127);
    assert.strictEqual(removed, true);
  });

  it('parses real compiler failures without inventing element IDs', () => {
    const output = [
      'info: vvvv[0]',
      '      Loading C:\\work\\broken.vl',
      'fail: vvvv[0]',
      '      There are build errors.',
      'Unhandled exception. VL.Lang.CompileException: Compilation failed: Error: Not found: DefinitelyMissingOperation',
      'last seen via',
      '  dependency: VL.CoreLib.vl',
      '  category: Primitive',
    ].join('\r\n');
    const diagnostics = parseCompilerOutput(output, 127);
    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].message, 'Error: Not found: DefinitelyMissingOperation');
    assert.strictEqual(diagnostics[0].elementId, undefined);
  });

  it('extracts IDs only in the VL 22-character form and deduplicates diagnostics', () => {
    const id = 'A1B2C3D4E5F6G7H8I9J0K1';
    const output = `fail: Node ${id} is invalid\nfail: Node ${id} is invalid`;
    const diagnostics = parseCompilerOutput(output, 1);
    assert.deepStrictEqual(diagnostics, [{ message: `Node ${id} is invalid`, elementId: id }]);
  });

  it('falls back to a generic diagnostic and formats process output', () => {
    assert.deepStrictEqual(parseCompilerOutput('something unexpected', 127), [
      { message: 'Compilation failed with exit code 127.' },
    ]);
    const result: ProcessResult = { code: 0, stdout: 'first', stderr: 'second' };
    assert.strictEqual(compilerOutputToText(result), 'first\nsecond');
  });
});
