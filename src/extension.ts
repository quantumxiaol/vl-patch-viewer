// The module 'vscode' contains the VS Code extensibility API.
import * as vscode from 'vscode';
import { VlPatchEditorProvider } from './vlPatchEditorProvider';
import { BuiltinRenderer } from './renderer';

export function activate(context: vscode.ExtensionContext): void {
  const renderer = new BuiltinRenderer();

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      VlPatchEditorProvider.viewType,
      new VlPatchEditorProvider(context, renderer),
      {
        // Keep the webview alive (including its pan/zoom state) when the user
        // switches to another tab and back.
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('vlPatch.viewer.showSource', () => {
      vscode.window.showInformationMessage(
        'Use the editor toolbar “Open vl with…” or right-click a .vl file to switch between text and graph view.'
      );
    })
  );
}

export function deactivate(): void {
  // The renderer is stateless, so there is nothing to dispose.
}
