import * as vscode from 'vscode';
import { existsSync } from 'fs';
import { copyFile } from 'fs/promises';
import * as path from 'path';
import { copyMissing, isInside } from './skillFiles';

export async function installSkills(context: vscode.ExtensionContext): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    void vscode.window.showErrorMessage('Open a workspace folder before installing agent skills.');
    return;
  }
  const config = vscode.workspace.getConfiguration('vlPatch', folder.uri);
  const configured = (config.get<string>('skillInstallDirectory') ?? '.agents/skills').trim() || '.agents/skills';
  if (path.isAbsolute(configured) || configured === '..' || configured.startsWith(`..${path.sep}`)) {
    void vscode.window.showErrorMessage('The skills directory must stay inside the workspace.');
    return;
  }

  const target = path.resolve(folder.uri.fsPath, configured);
  if (!isInside(folder.uri.fsPath, target)) {
    void vscode.window.showErrorMessage('The skills directory must stay inside the workspace.');
    return;
  }

  try {
    const source = path.join(context.extensionUri.fsPath, 'assets', 'vvvv-skills');
    const stats = await copyMissing(source, target);
    const agentFile = path.join(context.extensionUri.fsPath, 'assets', 'AGENTS.md');
    const agentTarget = path.join(folder.uri.fsPath, 'AGENTS.md');
    const skippedAgentFile = existsSync(agentTarget);
    if (!skippedAgentFile) {
      await copyFile(agentFile, agentTarget);
    }

    const message = `Agent skills installed: ${stats.copied} copied, ${stats.skipped} skipped. AGENTS.md was ${skippedAgentFile ? 'kept' : 'created'}.`;
    void vscode.window.showInformationMessage(message);
    const output = vscode.window.createOutputChannel('VL Patch Viewer');
    context.subscriptions.push(output);
    output.appendLine(message);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Unable to install agent skills: ${message}`);
  }
}
