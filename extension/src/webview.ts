import * as fs from 'fs';
import * as vscode from 'vscode';
import type { Requirement } from './types';
import { readState, saveState } from './state';

/** webview -> extension 消息协议，与前端 src/bridge.ts 保持一致 */
type BridgeMessage =
  | { type: 'ready' }
  | { type: 'save'; payload: { requirements?: Requirement[]; projects?: string[] } };

const PANEL_TITLE = '工作记录';
const MEDIA_DIR = 'media';

/** 生成 CSP nonce */
function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i += 1) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

/** 序列化初始数据时转义 HTML 敏感字符，防止注入 `</script>` 提前闭合（XSS 硬约束） */
function toSafeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** 工作记录 WebviewPanel（单例：复用已有面板，避免重复创建） */
export class WorkTrackerPanel {
  private static readonly viewType = 'workTrackerPanel';
  private static current: WorkTrackerPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly globalState: vscode.Memento;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, globalState: vscode.Memento) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.globalState = globalState;

    this.panel.webview.html = this.buildHtml();

    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      undefined,
      this.disposables,
    );
    this.panel.onDidDispose(
      () => {
        if (WorkTrackerPanel.current === this) {
          WorkTrackerPanel.current = undefined;
        }
      },
      undefined,
      this.disposables,
    );
  }

  /** 打开（或聚焦）面板 */
  public static show(extensionUri: vscode.Uri, globalState: vscode.Memento): void {
    if (WorkTrackerPanel.current) {
      WorkTrackerPanel.current.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      WorkTrackerPanel.viewType,
      PANEL_TITLE,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, MEDIA_DIR)],
      },
    );
    WorkTrackerPanel.current = new WorkTrackerPanel(panel, extensionUri, globalState);
  }

  private buildHtml(): string {
    const webview = this.panel.webview;
    const nonce = getNonce();

    // 读取 Vite 构建产物 index.html
    const indexPath = vscode.Uri.joinPath(this.extensionUri, MEDIA_DIR, 'index.html');
    let html = fs.readFileSync(indexPath.fsPath, 'utf-8');

    // 将相对资源路径替换为 asWebviewUri 绝对 URI
    const mediaUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, MEDIA_DIR));
    html = html.replace(/\.\/assets\//g, `${mediaUri.toString()}/assets/`);

    // 注入 CSP（antd 5 CSS-in-JS 需要 style-src 'unsafe-inline'）
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} https: data:;`,
      `style-src ${webview.cspSource} 'unsafe-inline';`,
      `script-src 'nonce-${nonce}' ${webview.cspSource};`,
      `font-src ${webview.cspSource} data:;`,
      `connect-src ${webview.cspSource} http://localhost:* ws://localhost:*;`,
    ].join(' ');
    html = html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);

    // 注入初始数据（__INITIAL_STATE__），供前端同步初始化
    const state = readState(this.globalState);
    const initScript = `<script nonce="${nonce}">window.__INITIAL_STATE__ = ${toSafeJson(state)};</script>`;
    html = html.replace('<body>', `<body>\n    ${initScript}`);

    return html;
  }

  private handleMessage(message: BridgeMessage): void {
    switch (message.type) {
      case 'ready':
        // 握手确认：webview 加载完成，无需额外处理
        break;
      case 'save':
        saveState(this.globalState, message.payload);
        break;
      default:
        // 未知消息静默忽略，避免日志刷屏
        break;
    }
  }
}
