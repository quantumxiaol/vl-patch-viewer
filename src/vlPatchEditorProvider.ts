// Custom text editor for .vl files: renders the patch as an interactive SVG
// node graph inside a webview. Text edits still go through VS Code's normal
// text model, so the user can switch between "Text Editor" and
// "VL Patch Graph" at any time without losing undo history.
import * as vscode from 'vscode';
import { VlRenderer } from './renderer';

interface RenderSuccessMessage {
  type: 'render';
  svg: string;
  fileName: string;
}

interface RenderErrorMessage {
  type: 'error';
  message: string;
}

interface StatusMessage {
  type: 'status';
  message: string;
}

type HostToWebview = RenderSuccessMessage | RenderErrorMessage | StatusMessage;

export class VlPatchEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'vlPatch.viewer';

  /** Shared watcher: .vl files edited externally (vvvv, other tools). */
  private static readonly watcher = vscode.workspace.createFileSystemWatcher('**/*.vl');

  /** Debounce delay for re-renders triggered by typing. */
  private static readonly debounceMs = 500;

  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly renderer: VlRenderer
  ) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'media'),
      ],
    };
    webviewPanel.webview.html = this.getHtml(webviewPanel.webview);

    let renderSeq = 0;
    let debounceTimer: NodeJS.Timeout | undefined;

    const render = async (reason: string): Promise<void> => {
      const seq = ++renderSeq;
      this.post(webviewPanel.webview, { type: 'status', message: `Rendering (${reason})…` });
      try {
        const result = this.renderer.render(document.getText());
        if (seq !== renderSeq) {
          return; // A newer render superseded this one.
        }
        this.post(webviewPanel.webview, {
          type: 'render',
          svg: result.svg,
          fileName: document.fileName,
        });
      } catch (err) {
        if (seq !== renderSeq) {
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        this.post(webviewPanel.webview, { type: 'error', message });
      }
    };

    const scheduleRender = (reason: string): void => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => { void render(reason); }, VlPatchEditorProvider.debounceMs);
    };

    // Initial render once the webview signals it is ready.
    const readySub = webviewPanel.webview.onDidReceiveMessage((msg: { type?: string }) => {
      if (msg?.type === 'ready') {
        void render('initial');
      } else if (msg?.type === 'nodeClicked') {
        // Phase 2 hook: show node details when graph hit-testing is added.
        void vscode.window.setStatusBarMessage(
          `VL node selected: ${String((msg as { nodeId?: string }).nodeId ?? 'unknown')}`,
          3000
        );
      }
    });

    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        scheduleRender('editing');
      }
    });

    const saveSub = vscode.workspace.onDidSaveTextDocument((saved) => {
      if (saved.uri.toString() === document.uri.toString()) {
        scheduleRender('saved');
      }
    });

    // External edits (e.g. the file is also open in vvvv). Skip when the
    // editor is dirty — the in-buffer render already reflects the latest state.
    const externalSub = VlPatchEditorProvider.watcher.onDidChange((uri) => {
      if (uri.toString() === document.uri.toString() && !document.isDirty) {
        scheduleRender('external change');
      }
    });

    webviewPanel.onDidDispose(() => {
      readySub.dispose();
      changeSub.dispose();
      saveSub.dispose();
      externalSub.dispose();
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    });
  }

  private post(webview: vscode.Webview, message: HostToWebview): void {
    void webview.postMessage(message);
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'webview.js')
    );
    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src data:;"
  >
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VL Patch Graph</title>
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #1b1d21; }
    #toolbar {
      position: fixed; top: 8px; right: 8px; z-index: 10;
      display: flex; gap: 4px; font: 12px/1.4 system-ui, sans-serif;
    }
    #toolbar button {
      background: #2d3036; color: #d5d9df; border: 1px solid #4a4f57;
      border-radius: 4px; padding: 2px 10px; cursor: pointer;
    }
    #toolbar button:hover { background: #3a3e45; }
    #status {
      position: fixed; left: 8px; bottom: 8px; z-index: 10;
      font: 11px/1.4 system-ui, sans-serif; color: #9aa1ab;
      background: rgba(20, 21, 24, 0.8); padding: 2px 8px; border-radius: 4px;
      max-width: 70%; white-space: pre-wrap;
    }
    #status.error { color: #ff8a8a; }
    #viewport {
      width: 100%; height: 100%; cursor: grab;
      user-select: none; -webkit-user-select: none;
    }
    #viewport.dragging { cursor: grabbing; }
    #scene { transform-origin: 0 0; user-select: none; -webkit-user-select: none; }
    #scene svg { display: block; user-select: none; -webkit-user-select: none; }
  </style>
</head>
<body>
  <div id="toolbar">
    <button id="zoom-in" title="Zoom in">+</button>
    <button id="zoom-out" title="Zoom out">−</button>
    <button id="zoom-fit" title="Fit to view">Fit</button>
    <button id="zoom-100" title="Actual size">100%</button>
  </div>
  <div id="viewport"><div id="scene"></div></div>
  <div id="status">Loading…</div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
