import * as assert from 'assert';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { validateDocumentText } from '../vl/diagnostics';
import { copyMissing, isInside } from '../vl/skillFiles';

const workspaceRoot = process.cwd();
const assetsRoot = path.join(workspaceRoot, 'assets');
const skillsRoot = path.join(assetsRoot, 'vvvv-skills');

describe('Bundled agent skills', () => {
  it('contains the complete skill set and bridge documentation', () => {
    const directories = [
      'vvvv-channels',
      'vvvv-custom-nodes',
      'vvvv-debugging',
      'vvvv-dotnet',
      'vvvv-editor-extensions',
      'vvvv-fileformat',
      'vvvv-fundamentals',
      'vvvv-node-libraries',
      'vvvv-patching',
      'vvvv-shaders',
      'vvvv-spreads',
      'vvvv-startup',
      'vvvv-testing',
      'vvvv-troubleshooting',
    ];
    for (const directory of directories) {
      assert.ok(existsSync(path.join(skillsRoot, directory)), `${directory} should be bundled`);
    }
    const bridge = readFileSync(path.join(skillsRoot, 'vl-patch-authoring', 'SKILL.md'), 'utf8');
    assert.ok(bridge.includes('vl-structure'));
    assert.ok(bridge.includes('vvvvc'));
    assert.ok(bridge.includes('vlPatch.installSkills'));
    assert.ok(readFileSync(path.join(skillsRoot, 'NOTICE.md'), 'utf8').includes('565bc5013e661f4d029d81417ddb2045dd1f629a'));
    assert.ok(readFileSync(path.join(assetsRoot, 'AGENTS.md'), 'utf8').includes('Problems'));
  });

  it('excludes runtime code from the bundled skills', () => {
    const files: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else {
          files.push(fullPath);
        }
      }
    };
    walk(skillsRoot);
    assert.ok(files.length >= 30);
    assert.ok(!files.some((file) => file.endsWith('.py') || file.endsWith('.lock') || file.endsWith('.exe')));
    assert.ok(!existsSync(path.join(skillsRoot, 'vvvv-fileformat', 'scripts')));
  });

  it('declares the install command and default workspace directory', () => {
    const manifest = JSON.parse(readFileSync(path.join(workspaceRoot, 'package.json'), 'utf8')) as {
      contributes: {
        commands: Array<{ command: string }>;
        configuration: { properties: Record<string, { default?: unknown }> };
      };
    };
    assert.ok(manifest.contributes.commands.some((command) => command.command === 'vlPatch.installSkills'));
    assert.strictEqual(manifest.contributes.configuration.properties['vlPatch.skillInstallDirectory']?.default, '.agents/skills');
  });
});

describe('Skill installation file copying', () => {
  it('copies missing files without overwriting user content', async () => {
    const source = await mkdtemp(path.join(tmpdir(), 'vl-skills-source-'));
    const target = await mkdtemp(path.join(tmpdir(), 'vl-skills-target-'));
    try {
      await mkdir(path.join(source, 'nested'), { recursive: true });
      await writeFile(path.join(source, 'root.md'), 'new');
      await writeFile(path.join(source, 'nested', 'child.md'), 'child');
      await writeFile(path.join(target, 'root.md'), 'keep');

      const stats = await copyMissing(source, target);
      assert.deepStrictEqual(stats, { copied: 1, skipped: 1 });
      assert.strictEqual(await readFile(path.join(target, 'root.md'), 'utf8'), 'keep');
      assert.strictEqual(await readFile(path.join(target, 'nested', 'child.md'), 'utf8'), 'child');
    } finally {
      await rm(source, { recursive: true, force: true });
      await rm(target, { recursive: true, force: true });
    }
  });

  it('recognizes workspace-relative targets', () => {
    const root = process.cwd();
    assert.ok(isInside(root, path.resolve(root, '.agent', 'skills')));
    assert.ok(!isInside(root, path.resolve(root, '..', 'outside')));
  });
});

describe('Document diagnostics', () => {
  it('returns structural diagnostics for duplicate IDs and parse failures', () => {
    const duplicate = readFileSync(path.join(workspaceRoot, 'test', 'fixtures', 'HowTo Simple PRC Robot in vvvv.vl'), 'utf8').replace(
      'Id="KsqEeQ9aVrDLoYzOMYYwFN"',
      'Id="EK0y3vYqIdUNsC4Txj56LY"'
    );
    assert.ok(validateDocumentText(duplicate).some((item) => item.code === 'duplicate-id'));

    const malformed = validateDocumentText('<Document><Patch></Document>');
    assert.strictEqual(malformed.length, 1);
    assert.strictEqual(malformed[0].code, 'xml-parse');
  });
});
