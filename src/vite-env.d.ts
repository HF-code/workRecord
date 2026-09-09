/// <reference types="vite/client" />

/** 插件版环境标记：由 vite define 注入，true=VSCode Webview，false=浏览器 Web 版 */
declare const __VSCODE__: boolean;

/** Vite 环境变量类型（由 .env.<mode> 注入，构建时替换） */
interface ImportMetaEnv {
  /** 服务端请求 baseUrl（origin）：留空=同源；填写=跨域直连该服务端 */
  readonly VITE_SERVER_BASE_URL?: string;
}

/** VSCode Webview 环境（仅插件版存在）下扩展 window */
interface Window {
  /** VSCode webview API（由 extension 注入，浏览器中不存在） */
  acquireVsCodeApi?: <T = unknown>() => T;
  /** 插件版初始化数据（extension 注入），Web 版不存在 */
  __INITIAL_STATE__?: unknown;
}
