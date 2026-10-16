import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { mkdtemp, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';

export interface CompilerInstallation {
  path: string;
  major: number;
  minor: number;
  preview: number;
}

export interface DetectionResult {
  status: 'found' | 'unavailable';
  installation?: CompilerInstallation;
  message?: string;
}

export interface DetectionDependencies {
  platform?: NodeJS.Platform;
  vvvvcPath?: string;
  exists?: (filePath: string) => boolean;
  readRegistry?: () => Promise<string[]>;
  readDirectories?: (directory: string) => Promise<string[]>;
  probe?: (filePath: string) => Promise<boolean>;
}

export interface CompileOptions {
  filePath: string;
  vvvvcPath?: string;
  nugetPath?: string;
  timeoutMs?: number;
  exec?: (file: string, args: string[], timeoutMs: number) => Promise<ProcessResult>;
  makeTempDirectory?: () => Promise<string>;
  removeDirectory?: (directory: string) => Promise<void>;
}

export interface ProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface CompilerDiagnostic {
  message: string;
  elementId?: string;
}

interface VersionParts {
  major: number;
  minor: number;
  preview: number;
}

const REGISTRY_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall';
const DEFAULT_INSTALL_DIRECTORY = 'C:\\Program Files\\vvvv';
const COMPILER_NAME = 'vvvvc.exe';

function parseVersion(filePath: string): VersionParts | undefined {
  if (/(?:alpha|beta|rc|test|dev)/i.test(filePath)) {
    return undefined;
  }
  const match = filePath.match(/vvvv_gamma_(\d+)\.(\d+)(?:-(\d+))?/i);
  if (!match) {
    return undefined;
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const preview = match[3] === undefined ? 0 : Number(match[3]);
  return major >= 7 && minor >= 0 && preview >= 0 ? { major, minor, preview } : undefined;
}

function compareCandidates(left: CompilerInstallation, right: CompilerInstallation): number {
  return right.major - left.major || right.minor - left.minor || right.preview - left.preview || left.path.localeCompare(right.path);
}

async function defaultReadRegistry(): Promise<string[]> {
  const result = await runProcess('reg.exe', ['query', REGISTRY_KEY, '/s'], 5000);
  return result.stdout.split(/\r?\n/)
    .map((line) => line.trim().match(/^InstallLocation\s+REG_\S+\s+(.+)$/)?.[1])
    .filter((value): value is string => value !== undefined);
}

async function defaultReadDirectories(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

async function defaultProbe(filePath: string): Promise<boolean> {
  try {
    await runProcess(filePath, ['--help'], 5000);
    return true;
  } catch {
    return false;
  }
}

async function runProcess(file: string, args: string[], timeoutMs: number): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stdout, stderr }));
      } else {
        resolve({ code: 0, stdout, stderr });
      }
    });
  });
}

async function runProcessResult(file: string, args: string[], timeoutMs: number): Promise<ProcessResult> {
  try {
    return await runProcess(file, args, timeoutMs);
  } catch (error) {
    const processError = error as NodeJS.ErrnoException & { code?: number | string; stdout?: string; stderr?: string };
    return {
      code: typeof processError.code === 'number' ? processError.code : null,
      stdout: processError.stdout ?? '',
      stderr: processError.stderr ?? String(error),
    };
  }
}

export async function detectCompiler(dependencies: DetectionDependencies = {}): Promise<DetectionResult> {
  const platform = dependencies.platform ?? process.platform;
  if (platform !== 'win32') {
    return { status: 'unavailable', message: 'vvvvc is only available on Windows.' };
  }
  const exists = dependencies.exists ?? existsSync;
  const probe = dependencies.probe ?? defaultProbe;
  const vvvvcPath = dependencies.vvvvcPath;
  if (vvvvcPath) {
    if (!exists(vvvvcPath) || !(await probe(vvvvcPath))) {
      throw new Error(`vvvvc is missing or not executable: ${vvvvcPath}`);
    }
    const version = parseVersion(vvvvcPath) ?? { major: 0, minor: 0, preview: 0 };
    return { status: 'found', installation: { path: vvvvcPath, ...version } };
  }

  const readRegistry = dependencies.readRegistry ?? defaultReadRegistry;
  const readDirectories = dependencies.readDirectories ?? defaultReadDirectories;
  const candidates: CompilerInstallation[] = [];
  let registryLocations: string[] = [];
  try {
    registryLocations = await readRegistry();
  } catch {
    registryLocations = [];
  }
  for (const location of registryLocations) {
    const version = parseVersion(location);
    if (version) {
      candidates.push({ path: path.win32.join(location, COMPILER_NAME), ...version });
    }
  }

  let directories: string[] = [];
  try {
    directories = await readDirectories(DEFAULT_INSTALL_DIRECTORY);
  } catch {
    directories = [];
  }
  for (const directory of directories) {
    const version = parseVersion(directory);
    if (version) {
      candidates.push({ path: path.win32.join(DEFAULT_INSTALL_DIRECTORY, directory, COMPILER_NAME), ...version });
    }
  }
  candidates.sort(compareCandidates);
  for (const candidate of candidates) {
    if (exists(candidate.path) && (await probe(candidate.path))) {
      return { status: 'found', installation: candidate };
    }
  }
  return { status: 'unavailable', message: 'No usable vvvvc installation was found.' };
}

export async function compilePatch(options: CompileOptions): Promise<ProcessResult> {
  const execute = options.exec ?? runProcessResult;
  const makeTemp = options.makeTempDirectory ?? ((): Promise<string> => mkdtemp(path.join(tmpdir(), 'vl-patch-viewer-')));
  const remove = options.removeDirectory ?? ((directory: string): Promise<void> => rm(directory, { recursive: true, force: true }));
  const outputDirectory = await makeTemp();
  const args = [
    options.filePath,
    '--output-directory', outputDirectory,
    '--output-type', 'Exe',
    '--verbosity', 'Information',
  ];
  if (options.nugetPath) {
    args.push('--nuget-path', options.nugetPath);
  }
  try {
    return await execute(options.vvvvcPath ?? '', args, options.timeoutMs ?? 120000);
  } finally {
    await remove(outputDirectory);
  }
}

export function parseCompilerOutput(output: string, exitCode: number | null): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];
  const seen = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^(?:info|warn|fail):\s+\w+\[\d+\]/.test(trimmed)) {
      continue;
    }
    const match = trimmed.match(/(?:Compilation failed:\s*|^fail:\s+)(.+)$/i);
    if (!match) {
      continue;
    }
    const detail = match[1].trim();
    if (!detail || detail.toLowerCase() === 'there are build errors.') {
      continue;
    }
    const elementId = detail.match(/(?:^|[^A-Za-z0-9])([A-Za-z0-9]{22})(?![A-Za-z0-9])/ )?.[1];
    const key = `${detail}\0${elementId ?? ''}`;
    if (!seen.has(key)) {
      diagnostics.push({ message: detail, elementId });
      seen.add(key);
    }
  }
  if (diagnostics.length === 0 && exitCode !== 0) {
    diagnostics.push({ message: `Compilation failed with exit code ${exitCode ?? 'unknown'}.` });
  }
  return diagnostics;
}

export function compilerOutputToText(result: ProcessResult): string {
  return [result.stdout, result.stderr].filter((part) => part.length > 0).join('\n');
}
