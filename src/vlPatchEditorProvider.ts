// Custom text editor for .vl files: renders the patch as an interactive SVG
// node graph inside a webview. Text edits still go through VS Code's normal
// text model, so the user can switch between "Text Editor" and
// "VL Patch Graph" at any time without losing undo history.
import * as vscode from 'vscode';
import { VlRenderer } from './renderer';
import { compilePatch, compilerOutputToText, detectCompiler, parseCompilerOutput } from './vl/compiler';
import { describeElement, ElementDetails } from './vl/details';
import { validateDocumentText } from './vl/diagnostics';
import { createStaticEdit, StaticEditRequest } from './vl/edits';
import { CanvasInfo, VlGraph } from './vl/graph';
import { parseXml } from './vl/xml';

interface RenderSuccessMessage {
  type: 'render';
  svg: string;
  fileName: string;
  canvases: CanvasInfo[];
  selectedCanvasId: string | null;
}

interface DetailsMessage {
  type: 'details';
  details: ElementDetails;
}

interface DetailsEmptyMessage {
  type: 'detailsEmpty';
}

interface RenderErrorMessage {
  type: 'error';
  message: string;
}

interface StatusMessage {
  type: 'status';
  message: string;
}

type HostToWebview = RenderSuccessMessage | DetailsMessage | DetailsEmptyMessage | RenderErrorMessage | StatusMessage;

type WebviewToHost =
  | { type: 'ready' }
  | { type: 'selectCanvas'; canvasId: string | null }
  | { type: 'selectElement'; elementId: string }
  | { type: 'validate' }
  | StaticEditRequest;

export class VlPatchEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'vlPatch.viewer';

  /** Shared watcher: .vl files edited externally (vvvv, other tools). */
  private static readonly watcher = vscode.workspace.createFileSystemWatcher('**/*.vl');

  /** Debounce delay for re-renders triggered by typing. */
  private static readonly debounceMs = 500;
  private static activeDocument: vscode.TextDocument | undefined;
  private static activeProvider: VlPatchEditorProvider | undefined;
  private readonly validations = new Set<string>();
  private readonly structuralDiagnostics = new Map<string, vscode.Diagnostic[]>();
  private readonly compilerDiagnostics = new Map<string, vscode.Diagnostic[]>();

  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly renderer: VlRenderer,
    private readonly diagnostics: vscode.DiagnosticCollection,
    private readonly output: vscode.OutputChannel
  ) {}

  public static async validateActiveDocument(): Promise<void> {
    if (!this.activeProvider || !this.activeDocument) {
      void vscode.window.showInformationMessage('Open a VL document to validate.');
      return;
    }
    await this.activeProvider.validateDocument(this.activeDocument);
  }

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

    VlPatchEditorProvider.activeProvider = this;
    VlPatchEditorProvider.activeDocument = document;
    const viewStateSub = webviewPanel.onDidChangeViewState((event) => {
      if (event.webviewPanel.active) {
        VlPatchEditorProvider.activeProvider = this;
        VlPatchEditorProvider.activeDocument = document;
      }
    });

    let renderSeq = 0;
    let debounceTimer: NodeJS.Timeout | undefined;
    let selectedCanvasId: string | null | undefined;
    let selectedElementId: string | undefined;

    const showDetails = (): void => {
      if (!selectedElementId) {
        this.post(webviewPanel.webview, { type: 'detailsEmpty' });
        return;
      }
      try {
        const graph = new VlGraph(parseXml(document.getText()));
        const details = describeElement(
          graph,
          selectedElementId,
          graph.canvasScope(selectedCanvasId ?? null)
        );
        this.post(webviewPanel.webview, { type: 'details', details });
      } catch {
        selectedElementId = undefined;
        this.post(webviewPanel.webview, { type: 'detailsEmpty' });
      }
    };

    const render = async (reason: string): Promise<void> => {
      const seq = ++renderSeq;
      this.post(webviewPanel.webview, { type: 'status', message: `Rendering (${reason})…` });
      try {
        this.validateStructure(document);
        const result = this.renderer.render(document.getText(), selectedCanvasId);
        if (seq !== renderSeq) {
          return; // A newer render superseded this one.
        }
        selectedCanvasId = result.selectedCanvasId;
        this.post(webviewPanel.webview, {
          type: 'render',
          svg: result.svg,
          fileName: document.fileName,
          canvases: result.canvases,
          selectedCanvasId: result.selectedCanvasId,
        });
        showDetails();
      } catch (err) {
        if (seq !== renderSeq) {
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        this.post(webviewPanel.webview, { type: 'error', message });
      }
    };

    const applyStaticEdit = async (request: StaticEditRequest): Promise<void> => {
      try {
        const edit = createStaticEdit(document.getText(), request, selectedCanvasId);
        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.replace(
          document.uri,
          new vscode.Range(document.positionAt(edit.start), document.positionAt(edit.end)),
          edit.newText
        );
        if (!(await vscode.workspace.applyEdit(workspaceEdit))) {
          throw new Error('VS Code rejected the static edit');
        }
        this.post(webviewPanel.webview, { type: 'status', message: 'Static value updated (unsaved)' });
        void vscode.window.setStatusBarMessage('VL static value updated; save to write it to disk.', 3000);
      } catch (err) {
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
    const readySub = webviewPanel.webview.onDidReceiveMessage((msg: WebviewToHost) => {
      if (msg.type === 'ready') {
        void render('initial');
      } else if (msg.type === 'selectCanvas') {
        selectedCanvasId = msg.canvasId;
        selectedElementId = undefined;
        this.post(webviewPanel.webview, { type: 'detailsEmpty' });
        void render('canvas');
      } else if (msg.type === 'selectElement') {
        selectedElementId = msg.elementId;
        showDetails();
      } else if (msg.type === 'setPinDefault' || msg.type === 'setPadValue') {
        void applyStaticEdit(msg);
      } else if (msg.type === 'validate') {
        void this.validateDocument(document);
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
        const config = vscode.workspace.getConfiguration('vlPatch', saved.uri);
        if (config.get<boolean>('validateOnSave', false)) {
          void this.validateDocument(saved);
        }
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
      viewStateSub.dispose();
      readySub.dispose();
      changeSub.dispose();
      saveSub.dispose();
      externalSub.dispose();
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    });
  }

  private validateStructure(document: vscode.TextDocument): void {
    const errors = validateDocumentText(document.getText());
    const diagnostics = errors.map((item) => {
      const diagnostic = new vscode.Diagnostic(
        this.rangeForElement(document, item.elementId),
        item.message,
        vscode.DiagnosticSeverity.Error
      );
      diagnostic.source = 'vl-structure';
      diagnostic.code = item.code;
      return diagnostic;
    });
    this.setStructuralDiagnostics(document, diagnostics);
  }

  private setStructuralDiagnostics(document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
    this.structuralDiagnostics.set(document.uri.toString(), diagnostics);
    this.setCombinedDiagnostics(document);
  }

  private setCompilerDiagnostics(document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
    this.compilerDiagnostics.set(document.uri.toString(), diagnostics);
    this.setCombinedDiagnostics(document);
  }

  private setCombinedDiagnostics(document: vscode.TextDocument): void {
    const structural = this.structuralDiagnostics.get(document.uri.toString()) ?? [];
    const compiler = this.compilerDiagnostics.get(document.uri.toString()) ?? [];
    this.diagnostics.set(document.uri, [...structural, ...compiler]);
  }

  private async validateDocument(document: vscode.TextDocument): Promise<void> {
    const uri = document.uri.toString();
    if (this.validations.has(uri)) {
      return;
    }
    this.validations.add(uri);
    try {
      const saved = await document.save();
      if (!saved) {
        void vscode.window.showErrorMessage('Unable to save the VL document before validation.');
        return;
      }
      const config = vscode.workspace.getConfiguration('vlPatch', document.uri);
      const detection = await detectCompiler({
        vvvvcPath: config.get<string>('vvvvcPath')?.trim() || undefined,
      });
      if (detection.status !== 'found' || !detection.installation) {
        throw new Error(detection.message ?? 'No usable vvvvc installation was found.');
      }
      const result = await compilePatch({
        filePath: document.fileName,
        vvvvcPath: detection.installation.path,
        nugetPath: config.get<string>('nugetPath')?.trim() || undefined,
      });
      const outputText = compilerOutputToText(result);
      this.output.appendLine(outputText);
      const diagnostics = parseCompilerOutput(outputText, result.code).map((item) => {
        const diagnostic = new vscode.Diagnostic(
          this.rangeForElement(document, item.elementId),
          item.message,
          vscode.DiagnosticSeverity.Error
        );
        diagnostic.source = 'vvvvc';
        return diagnostic;
      });
      this.setCompilerDiagnostics(document, diagnostics);
      if (result.code === 0) {
        void vscode.window.showInformationMessage('vvvvc compilation passed.');
      } else {
        void vscode.window.showErrorMessage('vvvvc compilation failed. See Problems and Output.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.output.appendLine(`vvvvc validation failed: ${message}`);
      void vscode.window.showErrorMessage(message);
    } finally {
      this.validations.delete(uri);
    }
  }

  private rangeForElement(document: vscode.TextDocument, elementId?: string): vscode.Range {
    if (elementId) {
      const match = new RegExp(`Id=["']${elementId}["']`).exec(document.getText());
      if (match) {
        const start = document.positionAt(match.index);
        return new vscode.Range(start, document.positionAt(match.index + match[0].length));
      }
    }
    return new vscode.Range(0, 0, 0, 0);
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
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #1b1d21; color: #d5d9df; }
    #canvas-bar {
      position: fixed; top: 8px; left: 8px; z-index: 10; display: flex; align-items: center;
      gap: 6px; font: 12px/1.4 system-ui, sans-serif;
    }
    #canvas-select {
      max-width: 280px; background: #2d3036; color: #d5d9df; border: 1px solid #4a4f57;
      border-radius: 4px; padding: 3px 6px;
    }
    #toolbar {
      position: fixed; top: 8px; right: 8px; z-index: 10;
      display: flex; gap: 4px; font: 12px/1.4 system-ui, sans-serif;
    }
    #toolbar button, .editor-row button {
      background: #2d3036; color: #d5d9df; border: 1px solid #4a4f57;
      border-radius: 4px; padding: 2px 10px; cursor: pointer;
    }
    #toolbar button:hover, .editor-row button:hover { background: #3a3e45; }
    #details {
      position: fixed; top: 42px; right: 8px; bottom: 8px; z-index: 9; width: 330px;
      overflow: auto; box-sizing: border-box; padding: 12px; border: 1px solid #4a4f57;
      border-radius: 6px; background: rgba(30, 32, 37, 0.97); font: 12px/1.45 system-ui, sans-serif;
    }
    #details[hidden] { display: none; }
    #details h2 { margin: 0 0 8px; font-size: 16px; font-weight: 600; }
    #details h3 { margin: 14px 0 6px; font-size: 12px; color: #9aa1ab; text-transform: uppercase; }
    .detail-row { margin: 4px 0; overflow-wrap: anywhere; }
    .detail-label { color: #9aa1ab; }
    .detail-value { color: #e6e9ed; font-family: Consolas, monospace; }
    .detail-pins { border-top: 1px solid #3a3e45; margin-top: 8px; padding-top: 4px; }
    .editor-row { display: flex; align-items: center; gap: 6px; margin: 5px 0; }
    .editor-row label { flex: 0 0 38%; overflow-wrap: anywhere; }
    .editor-row input {
      min-width: 0; flex: 1; box-sizing: border-box; background: #17181b; color: #e6e9ed;
      border: 1px solid #4a4f57; border-radius: 3px; padding: 3px 5px; font: 11px Consolas, monospace;
    }
    .detail-note { margin-top: 14px; color: #9aa1ab; }
    .detail-readonly { color: #9aa1ab; font-size: 11px; }
    #status {
      position: fixed; left: 8px; bottom: 8px; z-index: 10;
      font: 11px/1.4 system-ui, sans-serif; color: #9aa1ab;
      background: rgba(20, 21, 24, 0.8); padding: 2px 8px; border-radius: 4px;
      max-width: 60%; white-space: pre-wrap;
    }
    #status.error { color: #ff8a8a; }
    #viewport {
      width: 100%; height: 100%; cursor: grab;
      user-select: none; -webkit-user-select: none;
    }
    #viewport.dragging { cursor: grabbing; }
    #scene { transform-origin: 0 0; user-select: none; -webkit-user-select: none; }
    #scene svg { display: block; user-select: none; -webkit-user-select: none; }
    #scene .element.selected > rect:first-child { stroke: #4fc3f7; stroke-width: 2; }
  </style>
</head>
<body>
  <div id="canvas-bar">
    <label for="canvas-select">Canvas</label>
    <select id="canvas-select" aria-label="Canvas"><option>Loading…</option></select>
  </div>
  <div id="toolbar">
    <button id="zoom-in" title="Zoom in">+</button>
    <button id="zoom-out" title="Zoom out">−</button>
    <button id="zoom-fit" title="Fit to view">Fit</button>
    <button id="validate" title="Validate with vvvv">Validate</button>
    <button id="zoom-100" title="Actual size">100%</button>
  </div>
  <div id="viewport"><div id="scene"></div></div>
  <aside id="details" hidden><div id="details-content"></div></aside>
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
