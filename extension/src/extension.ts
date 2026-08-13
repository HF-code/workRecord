import * as vscode from 'vscode';
import { WorkTrackerPanel } from './webview';

const OPEN_PANEL_COMMAND = 'workTracker.openPanel';

console.log('[work-tracker] module loaded');

export function activate(context: vscode.ExtensionContext): void {
  console.log('[work-tracker] extension activated');

  try {
    // 命令：打开（或聚焦）工作记录面板
    const openPanel = vscode.commands.registerCommand(OPEN_PANEL_COMMAND, () => {
      try {
        WorkTrackerPanel.show(context.extensionUri, context.globalState);
      } catch (err) {
        console.error('[work-tracker] failed to open panel:', err);
        void vscode.window.showErrorMessage(`打开工作记录失败：${err instanceof Error ? err.message : String(err)}`);
      }
    });
    context.subscriptions.push(openPanel);
    console.log('[work-tracker] command registered:', OPEN_PANEL_COMMAND);

    // 状态栏入口
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = '$(book) 工作记录';
    statusBarItem.tooltip = '打开工作记录面板';
    statusBarItem.command = OPEN_PANEL_COMMAND;
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
    console.log('[work-tracker] status bar item created');
  } catch (err) {
    console.error('[work-tracker] activate failed:', err);
    void vscode.window.showErrorMessage(`插件激活失败：${err instanceof Error ? err.message : String(err)}`);
  }
}

export function deactivate(): void {
  // 无全局资源需要显式清理（面板与状态栏随 context 自动释放）
}